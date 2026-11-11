/* Real browser/API workflow against the running local research app. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
const requireFrontend = createRequire(path.join(root, "frontend/package.json"));
const { chromium } = requireFrontend("playwright");
const AxeBuilder = requireFrontend("@axe-core/playwright").default;
const artifactDir = path.join(root, "artifacts");
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, "tests/fixtures/planar-reference.json")),
);
const fixturePath = path.join(root, "tests/fixtures/planar-reference.png");
const base = process.env.NAILFORM_TEST_URL || "http://127.0.0.1:5173";
const summary = {
  run_at: new Date().toISOString(),
  status: "running",
  checks: [],
  errors: [],
  screenshots: [],
  accessibility: [],
  synthetic: true,
};
fs.mkdirSync(artifactDir, { recursive: true });

function check(name, value = true) {
  assert(value, name);
  summary.checks.push(name);
  console.log("PASS", name);
}
async function screenshot(page, name, locator) {
  const filename = path.join(artifactDir, name + ".png");
  if (!locator) await page.evaluate(() => window.scrollTo(0, 0));
  await (locator || page).screenshot({
    path: filename,
    fullPage: locator ? undefined : true,
  });
  summary.screenshots.push(path.relative(root, filename));
  if (
    [
      "desktop-landing",
      "desktop-calibration",
      "desktop-geometry",
      "desktop-review",
      "desktop-research",
      "mobile-calibration",
      "mobile-research",
    ].includes(name)
  ) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const violations = result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    }));
    summary.accessibility.push({ screen: name, violations });
    console.log(
      "A11Y",
      name,
      violations.map((v) => `${v.id}: ${v.nodes.length}`).join(", ") ||
        "no automated violations",
    );
  }
}
async function noOverflow(page, name) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  check(
    name + " has no horizontal page overflow",
    dimensions.scroll <= dimensions.viewport + 1,
  );
}
async function createSession(page, name) {
  await page
    .getByRole("button", { name: "Start measurement", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Session name").fill(name);
  check(
    "storage consent gates session creation",
    await dialog
      .getByRole("button", { name: "Enter the measurement lab" })
      .isDisabled(),
  );
  await dialog.getByRole("checkbox").check();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Enter the measurement lab" })
    .click();
  return (await response).json();
}
async function imagePosition(page, x, y) {
  const svg = page.locator(".image-editor > svg");
  await svg.scrollIntoViewIfNeeded();
  return svg.evaluate(
    (element, point) => {
      const p = new DOMPoint(point.x, point.y).matrixTransform(
        element.getScreenCTM(),
      );
      return { x: p.x, y: p.y };
    },
    { x, y },
  );
}
async function dragPoint(page, index, target) {
  const handle = page.locator("circle.contour-handle").nth(index);
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  const destination = await imagePosition(page, target.x, target.y);
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 4 });
  await page.mouse.up();
}

(async () => {
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--use-fake-device-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["camera"],
    acceptDownloads: true,
  });
  await context.addInitScript(() =>
    localStorage.setItem("nailform:language", "en"),
  );
  await context.addInitScript(() => {
    const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    window.__nailformCameraStreams = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await nativeGetUserMedia(constraints);
      window.__nailformCameraStreams.push(stream);
      return stream;
    };
  });
  const page = await context.newPage();
  const sessionIds = [];
  page.on("pageerror", (error) => summary.errors.push(error.message));
  try {
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await screenshot(page, "desktop-landing");
    await noOverflow(page, "Desktop landing");
    const session = await createSession(
      page,
      "Synthetic planar workflow — not customer data",
    );
    sessionIds.push(session.id);

    // Native media APIs with Chromium's explicit fake camera, not physical hardware.
    await page
      .getByRole("button", { name: "Open camera", exact: true })
      .click();
    await page.waitForFunction(() => {
      const video = document.querySelector("video");
      return video && video.readyState >= 2 && video.videoWidth > 0;
    });
    check("browser camera API produces a live preview with a test device");
    await page
      .getByRole("button", { name: "Switch camera", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        window.__nailformCameraStreams.length >= 2 &&
        window.__nailformCameraStreams[0]
          .getTracks()
          .every((t) => t.readyState === "ended") &&
        document.querySelector("video")?.readyState >= 2,
    );
    check("camera switching releases the previous media tracks");
    const captured = page.waitForResponse(
      (r) =>
        r.url().includes("/images?view=top") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Capture photograph", exact: true })
      .click();
    check(
      "test camera photograph persisted",
      (await captured).status() === 201,
    );
    await page
      .getByRole("button", { name: "Replace image", exact: true })
      .waitFor();
    check(
      "camera preview cleaned up after capture",
      (await page.locator("video").count()) === 0,
    );
    check(
      "all media tracks stop after capture",
      await page.evaluate(() =>
        window.__nailformCameraStreams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    );

    const uploaded = page.waitForResponse(
      (r) =>
        r.url().includes("/images?view=top") && r.request().method() === "POST",
    );
    await page.getByLabel("Upload nail photograph").setInputFiles(fixturePath);
    const image = await (await uploaded).json();
    await page.locator(".capture-stage img").waitFor();
    await page.waitForFunction(
      (id) =>
        document
          .querySelector(".capture-stage img")
          ?.getAttribute("src")
          ?.endsWith(id),
      image.id,
    );
    check("upload replacement displays the newest photograph");
    await screenshot(page, "desktop-capture");
    await page
      .getByRole("button", { name: "Calibrate & trace", exact: true })
      .click();
    await page
      .getByLabel("Known reference length")
      .fill(String(fixture.calibration.reference_mm));
    check(
      "measurement blocked until scale and contour are reviewed",
      await page.getByRole("button", { name: "Save & measure" }).isDisabled(),
    );
    for (const [key, label] of [
      ["a", "Set A · start"],
      ["b", "Set B · end"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      const target = await imagePosition(
        page,
        fixture.calibration[key].x,
        fixture.calibration[key].y,
      );
      await page.mouse.click(target.x, target.y);
    }
    await page.getByRole("button", { name: "Outline", exact: true }).click();
    for (let index = 0; index < fixture.contour.length; index++)
      await dragPoint(page, index, fixture.contour[index]);
    const cuticle = page.getByRole("slider", {
      name: "Cuticle midpoint",
      exact: true,
    });
    const before = await cuticle.getAttribute("aria-valuenow");
    await cuticle.focus();
    await page.keyboard.press("ArrowRight");
    check(
      "keyboard contour editing changes a point",
      (await cuticle.getAttribute("aria-valuenow")) !== before,
    );
    await page.getByRole("button", { name: "Undo contour adjustment" }).click();
    check(
      "undo restores the prior contour",
      (await cuticle.getAttribute("aria-valuenow")) === before,
    );
    await page.getByLabel("I placed the scale", { exact: false }).check();
    await page
      .getByLabel("I have manually reviewed all twelve", { exact: false })
      .check();
    await screenshot(page, "desktop-calibration");
    const measured = page.waitForResponse(
      (r) => r.url().endsWith("/measure") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save & measure" }).click();
    const measurement = await (await measured).json();
    check(
      "independent fixture projected length is 16 mm",
      Math.abs(measurement.length_mm - fixture.expected_length_mm) < 0.02,
    );
    check(
      "independent fixture maximum width is 10 mm",
      Math.abs(measurement.width_mm - fixture.expected_width_mm) < 0.02,
    );
    check(
      "unmeasured curvature remains unknown",
      measurement.provenance.transverse_rise_mm === "unknown",
    );
    summary.measurement = measurement;
    await page
      .getByLabel("I have reviewed the 2D measurements", { exact: false })
      .check();
    const generated = page.waitForResponse(
      (r) => r.url().endsWith("/generate") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Generate laboratory model" })
      .click();
    const model = await (await generated).json();
    check(
      "actual CAD generation passed validation",
      model.validation?.passed === true,
    );
    await page.locator(".viewer canvas").waitFor();
    check("generated mesh renders in a WebGL canvas");
    check(
      "fresh generation is not incorrectly marked stale",
      (await page.locator(".model-stale").count()) === 0,
    );
    await page.getByRole("button", { name: "below", exact: true }).click();
    await page.getByRole("button", { name: "Reset 3D view" }).click();
    await screenshot(page, "desktop-geometry");
    await screenshot(page, "actual-model", page.locator(".viewer").first());
    for (const format of ["stl", "step"]) {
      const downloadEvent = page.waitForEvent("download");
      await page
        .getByRole("link", { name: format.toUpperCase(), exact: true })
        .click();
      const download = await downloadEvent;
      const output = path.join(artifactDir, "synthetic-reference." + format);
      await download.saveAs(output);
      check(
        format.toUpperCase() + " downloads nonempty actual CAD",
        fs.statSync(output).size > 1000,
      );
    }
    const parameters = await (
      await context.request.get(base + model.downloads.parameters)
    ).json();
    check(
      "exported JSON retains measured and manual provenance",
      parameters.metadata.parameter_provenance.length_mm === "measured" &&
        parameters.metadata.parameter_provenance.transverse_rise_mm ===
          "manually_adjusted",
    );

    await page
      .getByRole("button", { name: "Professional review", exact: true })
      .click();
    await page
      .getByLabel("Notes & reference observations")
      .fill(
        "Synthetic browser workflow only. Geometry inspected; physical fit not evaluated.",
      );
    await page
      .getByLabel("The manually reviewed contour appears appropriate.", {
        exact: true,
      })
      .check();
    await page
      .getByLabel("The model geometry has been inspected", { exact: false })
      .check();
    await page
      .getByLabel("Research state", { exact: true })
      .selectOption("geometrically_reviewed");
    await page
      .getByRole("button", { name: "Save professional review", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review saved", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    await page
      .getByLabel("Observation at this point")
      .fill("Synthetic distal shape reference; no real anatomical claim.");
    await page
      .getByRole("button", { name: "Save photo note", exact: true })
      .click();
    await page.locator(".annotation-notes li").waitFor();
    await page
      .getByLabel("Reference projected length", { exact: true })
      .fill("16");
    await page
      .getByLabel("Reference projected width", { exact: true })
      .fill("10");
    await page
      .getByLabel("Independent reference & instrument")
      .fill(
        "Analytically specified synthetic 2D fixture; not physical metrology.",
      );
    await page
      .getByLabel("Repeated-reference group")
      .fill("synthetic-browser-reference");
    await page
      .getByLabel("Observed completion effort", { exact: true })
      .fill("120");
    await page
      .getByRole("button", { name: "Save reference observations", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Evidence saved", exact: true })
      .waitFor();
    const persisted = await (
      await context.request.get(base + "/api/sessions/" + session.id)
    ).json();
    check(
      "review, annotation and independent reference persisted",
      persisted.feedback.geometry_accepted &&
        persisted.annotations.length === 1 &&
        persisted.experiment.reference_length_mm === 16,
    );
    await screenshot(page, "desktop-review");

    const repeat = await (
      await context.request.post(base + "/api/sessions", {
        data: { name: "Synthetic repeated-reference study", consent: true },
      })
    ).json();
    sessionIds.push(repeat.id);
    const repeatImage = await (
      await context.request.post(
        base + `/api/sessions/${repeat.id}/images?view=top`,
        {
          multipart: {
            file: {
              name: "synthetic-reference.png",
              mimeType: "image/png",
              buffer: fs.readFileSync(fixturePath),
            },
          },
        },
      )
    ).json();
    const repeatContour = fixture.contour.map((point, index) =>
      index === 6 ? { ...point, y: point.y + 4 } : point,
    );
    const repeatedMeasurement = await context.request.post(
      base + `/api/sessions/${repeat.id}/measure`,
      {
        data: {
          image_id: repeatImage.id,
          contour: repeatContour,
          calibration: fixture.calibration,
          method: "calibrated_photo",
        },
      },
    );
    check(
      "second controlled measurement persists for descriptive repeatability",
      repeatedMeasurement.ok(),
    );
    const repeatSaved = await context.request.patch(
      base + `/api/sessions/${repeat.id}`,
      {
        data: {
          experiment: {
            reference_length_mm: 16,
            reference_width_mm: 10,
            reference_source: "Analytical synthetic fixture only.",
            repeat_group: "synthetic-browser-reference",
            effort_seconds: 100,
            notes:
              "Intentionally shifted distal point by four pixels, not a physical trial.",
          },
        },
      },
    );
    check(
      "independent repeated reference observation persists",
      repeatSaved.ok(),
    );
    await page.reload();

    await page
      .getByRole("button", { name: "Research journal", exact: true })
      .click();
    check(
      "journal reports the real saved session",
      (await page
        .getByRole("heading", { name: session.name, exact: true })
        .count()) === 1,
    );
    check(
      "research table computes signed reference error",
      (await page
        .getByText("16.200 / 16.000 / +0.200 mm", { exact: true })
        .count()) === 1,
    );
    check(
      "research table computes sample spread from actual saved sessions",
      (await page
        .getByText("SD 0.141 / range 0.200 mm", { exact: true })
        .count()) === 1,
    );
    await screenshot(page, "desktop-research");
    await page.reload();
    await page
      .getByRole("button", { name: "Research journal", exact: true })
      .click();
    await page
      .getByRole("heading", { name: session.name, exact: true })
      .waitFor();
    check("saved session survives a browser reload");

    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, "mobile-research");
    await noOverflow(page, "Mobile research");
    await page
      .getByRole("button", {
        name: new RegExp(session.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .first()
      .click();
    await page.locator(".viewer canvas").waitFor();
    await screenshot(page, "mobile-geometry");
    await noOverflow(page, "Mobile geometry");
    await page.setViewportSize({ width: 320, height: 740 });
    await noOverflow(page, "Small mobile geometry (320 px)");
    await screenshot(page, "small-mobile-geometry");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator(".workflow-nav")
      .getByRole("button", { name: /Calibrate & trace/ })
      .click();
    await screenshot(page, "mobile-calibration");
    await noOverflow(page, "Mobile editor");

    // Explicit camera denial, using a second isolated browser workspace.
    const deniedContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await deniedContext.addInitScript(() => {
      localStorage.setItem("nailform:language", "en");
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Test permission denied", "NotAllowedError");
      };
    });
    const deniedPage = await deniedContext.newPage();
    await deniedPage.goto(base);
    check(
      "another browser workspace cannot read private study",
      (
        await deniedContext.request.get(base + "/api/sessions/" + session.id)
      ).status() === 404,
    );
    const deniedSession = await createSession(
      deniedPage,
      "Synthetic denied-camera workflow",
    );
    await deniedPage
      .getByRole("button", { name: "Open camera", exact: true })
      .click();
    await deniedPage
      .getByRole("alert")
      .filter({ hasText: "Camera access was denied" })
      .waitFor();
    check(
      "camera denial offers an actionable upload fallback",
      await deniedPage
        .getByRole("button", { name: "Upload a photo", exact: true })
        .isVisible(),
    );
    const deniedUpload = deniedPage.waitForResponse(
      (r) =>
        r.url().includes("/images?view=top") && r.request().method() === "POST",
    );
    await deniedPage
      .getByLabel("Upload nail photograph")
      .setInputFiles(fixturePath);
    check(
      "upload works after camera denial",
      (await deniedUpload).status() === 201,
    );
    await screenshot(deniedPage, "mobile-upload-fallback");
    await noOverflow(deniedPage, "Mobile capture");
    await deniedContext.request.delete(
      base + "/api/sessions/" + deniedSession.id,
    );
    await deniedContext.close();

    await page
      .getByRole("button", { name: "NAILFORM LAB home", exact: true })
      .click();
    await screenshot(page, "mobile-landing");
    check(
      "automated WCAG checks have no detected violations on checked screens",
      summary.accessibility.every((result) => result.violations.length === 0),
    );
    check(
      "no unhandled browser application errors",
      summary.errors.length === 0,
    );
    summary.model = {
      parameters: model.parameters,
      metadata: model.metadata,
      validation: model.validation,
    };
    summary.status = "passed";
  } catch (error) {
    summary.status = "failed";
    summary.failure = error.message;
    throw error;
  } finally {
    for (const id of sessionIds) {
      const response = await context.request.delete(
        base + "/api/sessions/" + id,
      );
      check("synthetic test session deleted", response.status() === 204);
      const removed = await context.request.get(base + "/api/sessions/" + id);
      check("deleted session cannot be reopened", removed.status() === 404);
    }
    await browser.close();
    fs.writeFileSync(
      path.join(artifactDir, "browser-results.json"),
      JSON.stringify(summary, null, 2),
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
