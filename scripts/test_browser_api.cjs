/* Real Chromium IndexedDB/canvas checks for the static research runtime. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
const frontendRequire = createRequire(path.join(root, "frontend/package.json"));
const { chromium } = frontendRequire("playwright");
const esbuild = frontendRequire("esbuild");

(async () => {
  const folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "nailform-browser-api-"),
  );
  const output = path.join(folder, "runtime.js");
  await esbuild.build({
    stdin: {
      contents:
        'import {browserApi} from "./api"; import {measurePolygon} from "./measurement"; globalThis.researchApi=browserApi; globalThis.measurePolygon=measurePolygon;',
      resolveDir: path.join(root, "frontend/src/browser"),
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    outfile: output,
  });
  const server = http.createServer((request, response) => {
    if (request.url === "/runtime.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      fs.createReadStream(output).pipe(response);
    } else {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        '<!doctype html><html><head><title>Browser research runtime test</title></head><body><script src="/runtime.js"></script></body></html>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const checks = [];
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const first = await page.evaluate(async () => {
      const checks = [];
      const check = (condition, name) => {
        if (!condition) throw new Error(name);
        checks.push(name);
      };
      const api = globalThis.researchApi;
      const json = (method, value) => ({ method, body: JSON.stringify(value) });
      const rejects = async (operation, fragment) => {
        try {
          await operation();
          throw new Error("operation unexpectedly passed");
        } catch (error) {
          check(error.message.includes(fragment), "rejected: " + fragment);
        }
      };
      const health = await api("/health");
      check(
        health.cad_available && health.mode === "browser_local_research",
        "browser geometry availability is real",
      );
      await rejects(
        () =>
          api(
            "/sessions",
            json("POST", { name: "No consent", consent: false }),
          ),
        "Consent",
      );
      const session = await api(
        "/sessions",
        json("POST", { name: "Synthetic browser API test", consent: true }),
      );
      check(
        (await api("/sessions")).length === 1,
        "session creation and listing",
      );
      const base = "/sessions/" + session.id;
      const invalid = new FormData();
      invalid.append(
        "file",
        new Blob(["not an image"], { type: "image/png" }),
        "wrong.png",
      );
      await rejects(
        () => api(base + "/images", { method: "POST", body: invalid }),
        "valid JPEG",
      );
      check(
        (await api(base)).capture_attempts[0].outcome === "rejected",
        "rejected upload recorded",
      );
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 400;
      const context = canvas.getContext("2d");
      context.fillStyle = "#d4c8b8";
      context.fillRect(0, 0, 400, 400);
      context.fillStyle = "#111";
      context.fillRect(10, 10, 100, 6);
      const upload = async (view = "top", type = "image/png") => {
        const file = await new Promise((resolve) =>
          canvas.toBlob(resolve, type),
        );
        const form = new FormData();
        form.append("file", file, "fixture");
        return api(base + "/images?view=" + view, {
          method: "POST",
          body: form,
        });
      };
      const image = await upload();
      check(
        image.width === 400 &&
          image.height === 400 &&
          image.url.startsWith("blob:"),
        "photo persisted with actual dimensions and Blob URL",
      );
      check(
        image.metadata_stripped === true &&
          image.quality.engine === "browser_canvas_laplacian_v1",
        "browser quality metadata does not claim OpenCV",
      );
      check(
        (await fetch(image.url)).status === 200,
        "private image Blob URL works",
      );
      check(
        (await upload("front", "image/jpeg")).width === 400,
        "JPEG dimensions decoded and normalized",
      );
      check(
        (await upload("side", "image/webp")).width === 400,
        "WebP dimensions decoded and normalized",
      );
      const points = [
        [200, 50],
        [250, 50],
        [275, 90],
        [280, 150],
        [280, 220],
        [250, 250],
        [200, 250],
        [150, 250],
        [120, 220],
        [120, 150],
        [125, 90],
        [150, 50],
      ].map(([x, y]) => ({ x, y }));
      const measurement = {
        image_id: image.id,
        contour: points,
        calibration: {
          a: { x: 10, y: 10 },
          b: { x: 110, y: 10 },
          reference_mm: 10,
        },
        method: "calibrated_photo",
      };
      const measured = await api(base + "/measure", json("POST", measurement));
      check(
        measured.length_mm === 20 && measured.width_mm === 16,
        "known reference gives genuine 20 by 16 mm projected dimensions",
      );
      check(
        measured.provenance.transverse_rise_mm === "unknown",
        "curvature remains unknown",
      );
      const rotated = structuredClone(measurement),
        angle = (25 * Math.PI) / 180;
      for (const point of [
        ...rotated.contour,
        rotated.calibration.a,
        rotated.calibration.b,
      ]) {
        const x = point.x - 200,
          y = point.y - 200;
        point.x = 300 + x * Math.cos(angle) - y * Math.sin(angle);
        point.y = 300 + x * Math.sin(angle) + y * Math.cos(angle);
      }
      const result = globalThis.measurePolygon(rotated, 600, 600);
      check(
        result.length_mm === 20 && result.width_mm === 16,
        "rotated polygon and scale preserve dimensions",
      );
      const doubled = structuredClone(measurement);
      doubled.calibration.reference_mm = 20;
      check(
        globalThis.measurePolygon(doubled, 400, 400).length_mm === 40,
        "reference scale changes actual dimensions",
      );
      const zero = structuredClone(measurement);
      zero.calibration.b = zero.calibration.a;
      await rejects(
        () => api(base + "/measure", json("POST", zero)),
        "five image pixels",
      );
      const crossed = structuredClone(measurement);
      [crossed.contour[2], crossed.contour[8]] = [
        crossed.contour[8],
        crossed.contour[2],
      ];
      await rejects(
        () => api(base + "/measure", json("POST", crossed)),
        "cross or touch",
      );
      const outside = structuredClone(measurement);
      outside.contour[2].x = 500;
      await rejects(
        () => api(base + "/measure", json("POST", outside)),
        "inside the original image",
      );
      const nan = structuredClone(measurement);
      nan.contour[2].x = NaN;
      await rejects(
        () => api(base + "/measure", json("POST", nan)),
        "finite, nonnegative",
      );
      const wrong = structuredClone(measurement);
      wrong.contour.reverse();
      await rejects(
        () => api(base + "/measure", json("POST", wrong)),
        "right sidewall",
      );
      await Promise.all([
        api(base, json("PATCH", { name: "Renamed browser test" })),
        api(
          base,
          json("PATCH", {
            experiment: {
              reference_length_mm: 19.8,
              reference_source: "Independent declared reference",
              repeat_group: "A",
              effort_seconds: 37,
            },
          }),
        ),
      ]);
      const patched = await api(base);
      check(
        patched.name === "Renamed browser test" &&
          patched.experiment.reference_length_mm === 19.8,
        "concurrent writes preserve independent updates",
      );
      await rejects(
        () =>
          api(base, json("PATCH", { experiment: { reference_length_mm: 0 } })),
        "Reference length",
      );
      const pin = {
        id: "pin1",
        image_id: image.id,
        x: 0.5,
        y: 0.5,
        note: "Synthetic reference observation",
      };
      await api(base, json("PATCH", { annotations: [pin] }));
      await rejects(
        () =>
          api(
            base,
            json("PATCH", { annotations: [{ ...pin, image_id: "foreign" }] }),
          ),
        "Image not found",
      );
      await rejects(
        () => api(base, json("PATCH", { annotations: [pin, pin] })),
        "unique",
      );
      await rejects(
        () => api(base, json("PATCH", { state: "printed" })),
        "current generated model",
      );
      const parameters = {
        length_mm: 20,
        width_mm: 16,
        transverse_rise_mm: 1.2,
        longitudinal_rise_mm: 0.4,
        thickness_mm: 0.5,
        extension_mm: 2,
        tip_shape: "oval",
        asymmetry_mm: 0,
      };
      const generation = await api(
        base + "/generate",
        json("POST", { parameters, review_confirmed: true }),
      );
      check(
        generation.validation.passed === true &&
          generation.mesh.faces.length > 1000,
        "real browser shell generated and validated",
      );
      check(
        (await (await fetch(generation.downloads.step)).text()).includes(
          "FACETED_BREP",
        ),
        "actual STEP Blob export available",
      );
      const exported = await (
        await fetch(generation.downloads.parameters)
      ).json();
      check(
        exported.parameter_provenance.length_mm === "measured" &&
          exported.source_measurement.provenance.transverse_rise_mm ===
            "unknown",
        "parameter download retains measurement provenance",
      );
      const acceptance = {
        notes: "Geometric inspection only",
        issues: [],
        contour_accepted: true,
        geometry_accepted: true,
      };
      await api(
        base,
        json("PATCH", {
          feedback: acceptance,
          state: "geometrically_reviewed",
        }),
      );
      const rejected = await api(
        base,
        json("PATCH", {
          feedback: { ...acceptance, geometry_accepted: false },
        }),
      );
      check(
        rejected.state === "measurement_review_needed",
        "withdrawing geometric acceptance invalidates approved state",
      );
      await api(
        base,
        json("PATCH", {
          feedback: acceptance,
          state: "geometrically_reviewed",
        }),
      );
      await upload("oblique");
      const changed = await api(base);
      check(
        changed.state === "measurement_review_needed" &&
          !changed.feedback.geometry_accepted,
        "photo changes invalidate geometry approval",
      );
      const second = await api(
        base + "/generate",
        json("POST", {
          parameters: { ...parameters, width_mm: 15 },
          review_confirmed: true,
        }),
      );
      check(
        second.parameter_provenance.width_mm === "manually_adjusted",
        "manual dimension edit retains changed provenance",
      );
      check(
        (await api(base + "/models/" + generation.id)).id === generation.id,
        "historical model remains accessible for comparison",
      );
      return {
        checks,
        sid: session.id,
        imageId: image.id,
        mid: generation.id,
        latestMid: second.id,
        oldUrl: image.url,
        stl: await (await fetch(second.downloads.stl)).arrayBuffer(),
      };
    });
    checks.push(...first.checks);
    await page.reload();
    const second = await page.evaluate(
      async ({ sid, imageId, mid, latestMid }) => {
        const checks = [],
          api = globalThis.researchApi,
          base = "/sessions/" + sid;
        const check = (condition, name) => {
          if (!condition) throw new Error(name);
          checks.push(name);
        };
        const session = await api(base);
        check(
          session.latest_model.id === latestMid &&
            session.measurement.length_mm === 20,
          "session and actual mesh survive reload",
        );
        check(
          session.annotations.length === 1 &&
            session.experiment.reference_length_mm === 19.8,
          "annotations and independent references survive reload",
        );
        const image = session.images.find((image) => image.id === imageId);
        check(
          (await fetch(image.url)).status === 200,
          "image Blob URL rematerialized after reload",
        );
        const stl = await (
          await fetch(session.latest_model.downloads.stl)
        ).arrayBuffer();
        check(
          stl.byteLength > 1000,
          "STL Blob URL rematerialized after reload",
        );
        const oldModel = await api(base + "/models/" + mid);
        const url = oldModel.downloads.stl;
        await api(base + "/images/" + imageId, { method: "DELETE" });
        const removed = await api(base);
        check(
          !removed.measurement &&
            !removed.latest_model &&
            removed.annotations.length === 0,
          "source image deletion invalidates derived geometry and annotations",
        );
        for (const model of [mid, latestMid]) {
          let failed = false;
          try {
            await api(base + "/models/" + model);
          } catch {
            failed = true;
          }
          check(failed, "dependent archived model removed " + model);
        }
        let revoked = false;
        try {
          await fetch(url);
        } catch {
          revoked = true;
        }
        check(revoked, "deleted model Blob URL revoked");
        await api(base, { method: "DELETE" });
        check(
          (await api("/sessions")).length === 0,
          "session removed from persistent local records",
        );
        const connection = await new Promise((resolve, reject) => {
          const request = indexedDB.open("nailform-lab-browser-research-v1", 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const counts = await Promise.all(
          ["sessions", "images", "models"].map(
            (name) =>
              new Promise((resolve, reject) => {
                const request = connection
                  .transaction(name)
                  .objectStore(name)
                  .count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              }),
          ),
        );
        connection.close();
        check(
          counts.every((count) => count === 0),
          "session deletion removes all image and model assets atomically",
        );
        return { checks };
      },
      first,
    );
    checks.push(...second.checks);
    const proposals = await page.evaluate(async () => {
      const api = globalThis.researchApi,
        checks = [];
      const check = (condition, name) => {
        if (!condition) throw new Error(name);
        checks.push(name);
      };
      const json = (method, value) => ({ method, body: JSON.stringify(value) });
      const rejects = async (operation, fragment) => {
        let message = "";
        try {
          await operation();
        } catch (error) {
          message = error.message;
        }
        check(message.includes(fragment), "proposal rejected: " + fragment);
      };
      const session = await api(
        "/sessions",
        json("POST", {
          name: "Synthetic automatic proposal audit",
          consent: true,
        }),
      );
      const base = "/sessions/" + session.id;
      check(
        session.design.tip_shape === "oval" &&
          session.design.extension_mm === 2,
        "new research sessions retain explicit external design defaults",
      );
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 400;
      const context = canvas.getContext("2d");
      context.fillStyle = "#bca68b";
      context.fillRect(0, 0, 400, 400);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      const upload = async (target, view = "top") => {
        const form = new FormData();
        form.append("file", blob, "synthetic.png");
        return api(target + "/images?view=" + view, {
          method: "POST",
          body: form,
        });
      };
      const image = await upload(base);
      const points = [
        [200, 50],
        [250, 50],
        [275, 90],
        [280, 150],
        [280, 220],
        [250, 250],
        [200, 250],
        [150, 250],
        [120, 220],
        [120, 150],
        [125, 90],
        [150, 50],
      ].map(([x, y]) => ({ x, y }));
      const measurement = {
        image_id: image.id,
        contour: points,
        calibration: {
          a: { x: 10, y: 10 },
          b: { x: 110, y: 10 },
          reference_mm: 10,
        },
        method: "calibrated_photo",
      };
      const manual = await api(base + "/measure", json("POST", measurement));
      check(
        manual.contour_source === "manual_control_points",
        "legacy manual origin remains unchanged",
      );
      const parameters = {
        length_mm: 20,
        width_mm: 16,
        transverse_rise_mm: 1.2,
        longitudinal_rise_mm: 0.4,
        thickness_mm: 0.5,
        extension_mm: 2,
        tip_shape: "oval",
        asymmetry_mm: 0,
      };
      const priorModel = await api(
        base + "/generate",
        json("POST", { parameters, review_confirmed: true }),
      );
      await api(
        base,
        json("PATCH", {
          state: "geometrically_reviewed",
          feedback: {
            notes: "Synthetic geometric review only",
            issues: [],
            contour_accepted: true,
            geometry_accepted: true,
          },
        }),
      );
      for (const design of [
        { tip_shape: "square", extension_mm: 2 },
        { tip_shape: "almond", extension_mm: -1 },
        { tip_shape: "oval", extension_mm: 16 },
        { tip_shape: "oval", extension_mm: NaN },
        { tip_shape: "oval", extension_mm: true },
      ]) {
        await rejects(
          () => api(base, json("PATCH", { design })),
          design.tip_shape === "square"
            ? "extension shape"
            : "Extension length",
        );
      }
      await api(
        base,
        json("PATCH", { design: { tip_shape: "almond", extension_mm: 4 } }),
      );
      const designChanged = await api(base);
      check(
        designChanged.design.tip_shape === "almond" &&
          designChanged.design.extension_mm === 4,
        "external design preferences persist independently",
      );
      check(
        designChanged.latest_model.id === priorModel.id &&
          designChanged.measurement.id === manual.id,
        "design preference changes preserve the old CAD preview and source measurement",
      );
      check(
        !designChanged.feedback.geometry_accepted &&
          designChanged.feedback.contour_accepted &&
          designChanged.state === "measurement_review_needed",
        "external design changes invalidate only geometric review",
      );
      await api(
        base,
        json("PATCH", { design: { tip_shape: "squoval", extension_mm: 15 } }),
      );
      await api(
        base,
        json("PATCH", { design: { tip_shape: "oval", extension_mm: 0 } }),
      );
      check(
        (await api(base)).design.extension_mm === 0,
        "all supported design shapes and extension bounds accepted",
      );
      await api(
        base,
        json("PATCH", {
          design: { tip_shape: "oval", extension_mm: 2 },
          state: "geometrically_reviewed",
          feedback: {
            notes: "Synthetic geometric review only",
            issues: [],
            contour_accepted: true,
            geometry_accepted: true,
          },
        }),
      );
      // Simulate an existing saved record from before proposal fields existed.
      const connection = await new Promise((resolve, reject) => {
        const request = indexedDB.open("nailform-lab-browser-research-v1", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = connection.transaction("sessions", "readwrite"),
          store = transaction.objectStore("sessions"),
          get = store.get(session.id);
        get.onsuccess = () => {
          const legacy = get.result;
          delete legacy.contour_proposals;
          delete legacy.design;
          store.put(legacy);
        };
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
      });
      connection.close();
      check(
        (await api(base)).contour_proposals.length === 0,
        "legacy saved sessions without proposal fields remain usable",
      );
      check(
        (await api(base)).design.tip_shape === "oval",
        "legacy design preference derives from existing generated geometry",
      );
      const request = {
        image_id: image.id,
        points,
        method: "contrast_outline_v1",
        source: "photo",
        tip_direction: "down",
      };
      for (const [name, change, fragment] of [
        [
          "out of bounds",
          (data) => {
            data.points[1].x = 400;
          },
          "inside the original image",
        ],
        [
          "crossing",
          (data) => {
            [data.points[2], data.points[8]] = [data.points[8], data.points[2]];
          },
          "cross or touch",
        ],
        [
          "duplicate",
          (data) => {
            data.points[1] = { ...data.points[2] };
          },
          "distinct",
        ],
        [
          "nonfinite",
          (data) => {
            data.points[1].x = NaN;
          },
          "finite",
        ],
        [
          "boolean",
          (data) => {
            data.points[1].x = true;
          },
          "finite",
        ],
        [
          "wrong count",
          (data) => {
            data.points.pop();
          },
          "exactly twelve",
        ],
        [
          "wrong sidewalls",
          (data) => {
            data.points.reverse();
          },
          "sidewall landmarks",
        ],
        [
          "unsupported method",
          (data) => {
            data.method = "verified_scan";
          },
          "method is unsupported",
        ],
        [
          "unsupported source",
          (data) => {
            data.source = "measured";
          },
          "proposal source",
        ],
        [
          "unsupported orientation",
          (data) => {
            data.tip_direction = "left";
          },
          "tip direction",
        ],
      ]) {
        const invalid = structuredClone(request);
        change(invalid);
        await rejects(
          () => api(base + "/contour-proposals", json("POST", invalid)),
          fragment,
        );
        check(
          (await api(base)).contour_proposals.length === 0,
          "invalid " + name + " proposal did not persist",
        );
      }
      const side = await upload(base, "side");
      await rejects(
        () =>
          api(
            base + "/contour-proposals",
            json("POST", { ...request, image_id: side.id }),
          ),
        "Only top-view",
      );
      // Reconfirm after this independent photo change, before checking proposal-only behavior.
      await api(
        base,
        json("PATCH", {
          state: "geometrically_reviewed",
          feedback: {
            notes: "Synthetic geometric review only",
            issues: [],
            contour_accepted: true,
            geometry_accepted: true,
          },
        }),
      );
      const first = await api(
        base + "/contour-proposals",
        json("POST", request),
      );
      check(
        first.review_required === true && first.points.length === 12,
        "stored automatic candidates always require human review",
      );
      const pending = await api(base);
      check(
        pending.measurement.id === manual.id &&
          pending.latest_model.id === priorModel.id &&
          pending.state === "geometrically_reviewed",
        "proposal storage preserves previously confirmed measurement and model",
      );
      check(
        pending.images.find((item) => item.id === image.id).contour_proposal
          .id === first.id,
        "latest proposal exposed on owning image metadata",
      );
      const changedRequest = structuredClone(request);
      changedRequest.points[1].x += 2;
      changedRequest.source = "live_camera";
      const next = await api(
        base + "/contour-proposals",
        json("POST", changedRequest),
      );
      check(
        (await api(base)).contour_proposals.length === 2,
        "new proposal preserves previous audit snapshot",
      );
      check(
        (await api(base)).versions.some(
          (version) =>
            version.kind === "contour_proposal" &&
            version.proposal.id === first.id,
        ),
        "proposal audit version retains raw original points",
      );
      const otherSession = await api(
          "/sessions",
          json("POST", { name: "Separate source image", consent: true }),
        ),
        otherBase = "/sessions/" + otherSession.id;
      const otherImage = await upload(otherBase);
      await rejects(
        () =>
          api(
            base + "/contour-proposals",
            json("POST", { ...request, image_id: otherImage.id }),
          ),
        "Image not found",
      );
      const foreign = await api(
        otherBase + "/contour-proposals",
        json("POST", { ...request, image_id: otherImage.id }),
      );
      const secondOtherImage = await upload(otherBase);
      const secondOtherProposal = await api(
        otherBase + "/contour-proposals",
        json("POST", { ...request, image_id: secondOtherImage.id }),
      );
      await rejects(
        () =>
          api(
            otherBase + "/measure",
            json("POST", {
              ...measurement,
              image_id: otherImage.id,
              proposal_id: secondOtherProposal.id,
            }),
          ),
        "not found for this image",
      );
      await rejects(
        () =>
          api(
            base + "/measure",
            json("POST", { ...measurement, proposal_id: foreign.id }),
          ),
        "not found for this image",
      );
      await rejects(
        () =>
          api(
            base + "/measure",
            json("POST", { ...measurement, proposal_id: "missing" }),
          ),
        "not found for this image",
      );
      const automatic = await api(
        base + "/measure",
        json("POST", { ...measurement, proposal_id: first.id }),
      );
      check(
        automatic.contour_source === "automatic_human_reviewed" &&
          automatic.contour_proposal_id === first.id,
        "unchanged reviewed proposal has explicit automatic origin",
      );
      check(
        automatic.contour_proposal.id === first.id &&
          automatic.provenance.transverse_rise_mm === "unknown",
        "original proposal persists without inventing curvature",
      );
      const tolerance = structuredClone(measurement);
      tolerance.contour[10].x += 0.01;
      check(
        (
          await api(
            base + "/measure",
            json("POST", { ...tolerance, proposal_id: first.id }),
          )
        ).contour_source === "automatic_human_reviewed",
        "0.01 pixel tolerance is stable at floating-point boundary",
      );
      const adjustedRequest = structuredClone(measurement);
      adjustedRequest.contour[1].x += 0.02;
      const adjusted = await api(
        base + "/measure",
        json("POST", { ...adjustedRequest, proposal_id: first.id }),
      );
      check(
        adjusted.contour_source === "automatic_human_adjusted" &&
          adjusted.contour_proposal.points[1].x === points[1].x,
        "manual adjustment is distinct from immutable automatic proposal",
      );
      const explicitManual = await api(
        base + "/measure",
        json("POST", measurement),
      );
      check(
        explicitManual.contour_source === "manual_control_points" &&
          !explicitManual.contour_proposal_id,
        "manual mode does not inherit automatic proposal provenance",
      );
      const upwardRequest = {
        ...request,
        tip_direction: "up",
        points: points.map((point) => ({ x: 399 - point.x, y: 399 - point.y })),
      };
      const upward = await api(
        base + "/contour-proposals",
        json("POST", upwardRequest),
      );
      check(
        upward.tip_direction === "up",
        "upward user-specified tip orientation accepts correct axis mapping",
      );
      await api(
        base + "/measure",
        json("POST", { ...adjustedRequest, proposal_id: first.id }),
      );
      const generated = await api(
        base + "/generate",
        json("POST", { parameters, review_confirmed: true }),
      );
      const exported = await (
        await fetch(generated.downloads.parameters)
      ).json();
      check(
        exported.source_measurement.contour_source ===
          "automatic_human_adjusted" &&
          exported.source_measurement.contour_proposal.id === first.id,
        "CAD export retains original automatic proposal and adjustment provenance",
      );
      check(
        exported.source_measurement.contour_proposal.points[1].x ===
          points[1].x,
        "export audit snapshot remains original after newer proposals",
      );
      await api(otherBase, { method: "DELETE" });
      return {
        checks,
        sid: session.id,
        imageId: image.id,
        proposalId: first.id,
        latestProposalId: upward.id,
        modelId: generated.id,
        priorModelId: priorModel.id,
        secondProposalId: next.id,
      };
    });
    checks.push(...proposals.checks);
    await page.reload();
    const proposalReload = await page.evaluate(
      async ({
        sid,
        imageId,
        proposalId,
        latestProposalId,
        modelId,
        priorModelId,
      }) => {
        const api = globalThis.researchApi,
          checks = [],
          base = "/sessions/" + sid;
        const check = (condition, name) => {
          if (!condition) throw new Error(name);
          checks.push(name);
        };
        const restored = await api(base);
        check(
          restored.contour_proposals.length === 3 &&
            restored.contour_proposals.some(
              (proposal) => proposal.id === proposalId,
            ),
          "all automatic proposal versions survive browser reload",
        );
        check(
          restored.images.find((image) => image.id === imageId).contour_proposal
            .id === latestProposalId,
          "current image proposal survives reload",
        );
        check(
          restored.measurement.contour_source === "automatic_human_adjusted" &&
            restored.measurement.contour_proposal.id === proposalId,
          "measurement original proposal audit survives reload",
        );
        check(
          restored.design.tip_shape === "oval" &&
            restored.design.extension_mm === 2,
          "external design preferences survive browser reload",
        );
        const exported = await (
          await fetch(restored.latest_model.downloads.parameters)
        ).json();
        check(
          exported.source_measurement.contour_proposal.id === proposalId,
          "restored export Blob retains automatic proposal snapshot",
        );
        await api(base + "/images/" + imageId, { method: "DELETE" });
        const deleted = await api(base);
        check(
          deleted.contour_proposals.length === 0 &&
            !deleted.versions.some(
              (version) => version.kind === "contour_proposal",
            ),
          "image deletion purges all its proposal versions and audit snapshots",
        );
        for (const id of [modelId, priorModelId]) {
          let failed = false;
          try {
            await api(base + "/models/" + id);
          } catch {
            failed = true;
          }
          check(failed, "image deletion removes proposal-dependent CAD " + id);
        }
        await api(base, { method: "DELETE" });
        check(
          (await api("/sessions")).length === 0,
          "proposal test sessions removed without leaving research records",
        );
        return checks;
      },
      proposals,
    );
    checks.push(...proposalReload);
    assert.deepEqual(errors, [], "unhandled browser errors");
    checks.forEach((name) => console.log("PASS", name));
    console.log(
      `${checks.length} browser API/storage/measurement checks passed.`,
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(folder, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
