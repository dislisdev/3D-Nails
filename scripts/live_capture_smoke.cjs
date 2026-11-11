/* Real local video/vision/editor integration using clearly synthetic optical controls. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, ".."),
  dist = path.join(root, "frontend/dist");
const requireFrontend = createRequire(path.join(root, "frontend/package.json"));
const { chromium } = requireFrontend("playwright");
const AxeBuilder = requireFrontend("@axe-core/playwright").default;
const artifacts = path.join(root, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const result = {
  run_at: new Date().toISOString(),
  status: "running",
  checks: [],
  errors: [],
  backend_requests: [],
  synthetic: true,
};
const check = (name, value = true) => {
  assert(value, name);
  result.checks.push(name);
  console.log("PASS", name);
};
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  if (!pathname.startsWith("/3D-Nails/")) {
    response.writeHead(404).end();
    return;
  }
  const filename = path.resolve(
    dist,
    pathname.slice("/3D-Nails/".length) || "index.html",
  );
  if (
    !filename.startsWith(dist + path.sep) ||
    !fs.existsSync(filename) ||
    !fs.statSync(filename).isFile()
  ) {
    response.writeHead(404).end();
    return;
  }
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".png": "image/png",
  };
  response.writeHead(200, {
    "Content-Type": mime[path.extname(filename)] || "application/octet-stream",
  });
  fs.createReadStream(filename).pipe(response);
});
async function imagePosition(page, point) {
  const svg = page.locator(".image-editor > svg");
  await svg.scrollIntoViewIfNeeded();
  return svg.evaluate((element, p) => {
    const v = new DOMPoint(p.x, p.y).matrixTransform(element.getScreenCTM());
    return { x: v.x, y: v.y };
  }, point);
}
async function drag(page, index, dx, dy, offset = 0) {
  const point = page.locator("circle.contour-handle").nth(index);
  await point.scrollIntoViewIfNeeded();
  const box = await point.boundingBox();
  const x = box.x + box.width / 2 + offset,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}
async function download(page, locator, name) {
  const event = page.waitForEvent("download");
  await locator.click();
  const file = await event;
  const target = path.join(artifacts, name);
  await file.saveAs(target);
  return fs.readFileSync(target);
}

(async () => {
  const { makeContourFixture, writeFixturePNG } = await import(
    "./contour_fixture_helpers.mjs"
  );
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "nailform-live-smoke-"),
  );
  const fixture = makeContourFixture();
  const filename = path.join(temporary, "synthetic-plate.png");
  await writeFixturePNG(fixture, filename);
  const picture =
    "data:image/png;base64," + fs.readFileSync(filename).toString("base64");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/3D-Nails/`;
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1000 },
    acceptDownloads: true,
  });
  await context.addInitScript(
    ({ picture }) => {
      localStorage.setItem("nailform:language", "en");
      window.__syntheticCameraState = { blank: false, dx: 0, dy: 0 };
      window.__syntheticStreams = [];
      navigator.mediaDevices.getUserMedia = async () => {
        const photograph = new Image();
        photograph.src = picture;
        await photograph.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 640;
        const draw = canvas.getContext("2d");
        let stream;
        const paint = () => {
          draw.fillStyle = "#2e3942";
          draw.fillRect(0, 0, 480, 640);
          const state = window.__syntheticCameraState;
          if (!state.blank) {
            draw.drawImage(photograph, state.dx * 480, state.dy * 640);
            draw.strokeStyle = "#101010";
            draw.lineWidth = 3;
            draw.beginPath();
            draw.moveTo(30, 40);
            draw.lineTo(30, 140);
            draw.stroke();
          }
          if (!stream || stream.active) requestAnimationFrame(paint);
        };
        paint();
        stream = canvas.captureStream(20);
        window.__syntheticStreams.push(stream);
        return stream;
      };
    },
    { picture },
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/"))
      result.backend_requests.push(request.url());
  });
  try {
    await page.goto(base);
    await page
      .getByRole("button", { name: "Start measurement", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Session name")
      .fill("Synthetic live contour and free-edge test");
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Enter the measurement lab" })
      .click();
    check(
      "manual capture remains the default",
      (await page
        .getByRole("button", { name: "Manual", exact: true })
        .getAttribute("aria-pressed")) === "true",
    );
    await page.getByRole("button", { name: /Automatic live/ }).click();
    await page
      .getByRole("button", { name: "Open camera", exact: true })
      .click();
    const capture = page.getByRole("button", {
      name: "Capture with proposed outline",
      exact: true,
    });
    await page.waitForFunction(
      () => {
        const b = [...document.querySelectorAll("button")].find((b) =>
          b.textContent.includes("Capture with proposed outline"),
        );
        return b && !b.disabled;
      },
      { timeout: 20000 },
    );
    check("actual local video pixels produce a steady automatic outline");
    check(
      "a detected boundary is drawn",
      (await page.locator(".live-contour-boundary").count()) === 1,
    );
    check(
      "framing target is visible",
      (await page.locator(".live-framing-target").count()) === 1,
    );
    await page.evaluate(() => {
      window.__syntheticCameraState.dx = 0.12;
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector(".live-framing-instruction")
          ?.textContent.toLowerCase()
          .includes("left"),
      { timeout: 15000 },
    );
    check("live guidance points left when the detected nail moves right");
    await page.evaluate(() => {
      window.__syntheticCameraState.blank = true;
    });
    await page.waitForFunction(
      () => !document.querySelector(".live-contour-boundary"),
    );
    check("lost detection clears the previous outline");
    check(
      "neutral guide remains when detection is unavailable",
      (await page.locator(".live-framing-target").count()) === 1,
    );
    check(
      "automatic outline capture is blocked without a current candidate",
      await capture.isDisabled(),
    );
    await page.evaluate(() => {
      window.__syntheticCameraState.blank = false;
      window.__syntheticCameraState.dx = 0;
    });
    await page.waitForFunction(
      () => {
        const b = [...document.querySelectorAll("button")].find((b) =>
          b.textContent.includes("Capture with proposed outline"),
        );
        return b && !b.disabled;
      },
      { timeout: 15000 },
    );
    await page.screenshot({
      path: path.join(artifacts, "automatic-live-guidance.png"),
      fullPage: true,
    });
    await capture.click();
    await page.locator(".image-editor > svg").waitFor();
    check(
      "automatic capture opens the editor without an extra navigation click",
    );
    check(
      "captured automatic proposal fills all twelve controls",
      (await page.locator(".contour-handle").count()) === 12,
    );
    check(
      "automatic origin is shown",
      (await page.locator(".outline-origin").innerText()).includes(
        "automatic proposal",
      ),
    );
    check(
      "camera tracks stop after capture",
      await page.evaluate(() =>
        window.__syntheticStreams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    );
    const original = await page
      .locator(".contour-handle")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          x: Number(n.getAttribute("cx")),
          y: Number(n.getAttribute("cy")),
        })),
      );
    const imageUrl = await page
      .locator(".image-editor image")
      .getAttribute("href");
    const pixels = await page.evaluate(async (url) => {
      const photograph = await createImageBitmap(
        await (await fetch(url)).blob(),
      );
      const canvas = document.createElement("canvas");
      canvas.width = photograph.width;
      canvas.height = photograph.height;
      const c = canvas.getContext("2d");
      c.drawImage(photograph, 0, 0);
      const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0,
        count = 0;
      for (let i = 0; i < canvas.width * canvas.height; i++)
        if (
          data[i * 4] > 220 &&
          data[i * 4 + 1] > 170 &&
          data[i * 4 + 2] > 160
        ) {
          sum += (i % canvas.width) + 0.5;
          count++;
        }
      return {
        width: canvas.width,
        height: canvas.height,
        plateX: sum / count,
      };
    }, imageUrl);
    check(
      "proposal coordinates use the actual captured frame",
      Math.abs(
        original.reduce((n, p) => n + p.x, 0) / original.length - pixels.plateX,
      ) <
        pixels.width * 0.04,
    );
    check(
      "known scale still required before measuring",
      await page.getByRole("button", { name: "Save & measure" }).isDisabled(),
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Pan image", exact: true }).click();
    const before = Number(
      await page.locator(".contour-handle").nth(2).getAttribute("cx"),
    );
    await drag(page, 2, 8, 0, 12);
    const after = Number(
      await page.locator(".contour-handle").nth(2).getAttribute("cx"),
    );
    check(
      "a small white point can be dragged using its larger touch area in Pan mode",
      Math.abs(after - before) > 1,
    );
    await page.getByRole("button", { name: "Undo contour adjustment" }).click();
    check(
      "undo restores the automatically proposed point",
      Math.abs(
        Number(
          await page.locator(".contour-handle").nth(2).getAttribute("cx"),
        ) - before,
      ) < 0.01,
    );
    await page.locator(".point-adjustments summary").click();
    await page.getByLabel("Selected point", { exact: true }).selectOption("4");
    const coordinate = page.getByLabel("Horizontal image position", {
      exact: true,
    });
    const initial = Number(await coordinate.inputValue());
    await page
      .getByRole("button", { name: "Move point right", exact: true })
      .click();
    check(
      "all twelve points have precise manual controls",
      Number(await coordinate.inputValue()) === initial + 1,
    );
    await coordinate.fill(String(initial));

    await page.getByLabel("Known reference length").fill("5");
    for (const [key, point] of [
      ["Set A · start", { x: 30, y: 40 }],
      ["Set B · end", { x: 30, y: 140 }],
    ]) {
      await page.getByRole("button", { name: key, exact: true }).click();
      const p = await imagePosition(page, point);
      await page.mouse.click(p.x, p.y);
    }
    const contourBeforeShape = await page
      .locator(".contour-handle")
      .evaluateAll((nodes) =>
        nodes.map((n) => [n.getAttribute("cx"), n.getAttribute("cy")]),
      );
    await page.getByRole("button", { name: "Nail shape", exact: true }).click();
    await page
      .getByRole("button", { name: "Oval free-edge shape", exact: true })
      .click();
    await page.locator(".free-edge-design-preview").waitFor();
    const oval = await page
      .locator(".free-edge-design-preview")
      .getAttribute("points");
    await page
      .getByRole("button", { name: "Almond free-edge shape", exact: true })
      .click();
    const almond = await page
      .locator(".free-edge-design-preview")
      .getAttribute("points");
    check(
      "choosing a nail shape changes the separate free-edge preview",
      oval !== almond &&
        (await page
          .locator(".free-edge-design-preview")
          .getAttribute("data-design-shape")) === "almond",
    );
    check(
      "shape selection preserves the measured natural outline",
      JSON.stringify(contourBeforeShape) ===
        JSON.stringify(
          await page
            .locator(".contour-handle")
            .evaluateAll((nodes) =>
              nodes.map((n) => [n.getAttribute("cx"), n.getAttribute("cy")]),
            ),
        ),
    );
    await page.getByRole("button", { name: "Pan image", exact: true }).click();
    await drag(page, 2, 2, 0);
    check(
      "manual correction is clearly distinguished",
      (await page.locator(".outline-origin").innerText()).includes(
        "manual corrections",
      ),
    );
    await page.getByLabel("I placed the scale", { exact: false }).check();
    await page
      .getByLabel("I have manually reviewed all twelve", { exact: false })
      .check();
    await page.screenshot({
      path: path.join(artifacts, "automatic-contour-shape-editor.png"),
      fullPage: true,
    });
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    result.accessibility = a11y.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    }));
    check(
      "new editor controls have no automated WCAG violations",
      a11y.violations.length === 0,
    );
    await page.getByRole("button", { name: "Save & measure" }).click();
    await page.locator(".parameter-panel").waitFor();
    check(
      "selected free-edge shape persists into the CAD step",
      (await page
        .getByRole("button", { name: "Almond free-edge shape", exact: true })
        .getAttribute("aria-pressed")) === "true",
    );
    await page
      .getByLabel("I have reviewed the 2D measurements", { exact: false })
      .check();
    await page
      .getByRole("button", { name: "Generate laboratory model", exact: true })
      .click();
    await page.locator(".viewer canvas").waitFor();
    const metadata = JSON.parse(
      (
        await download(
          page,
          page.getByRole("link", { name: /Parameters JSON/ }).first(),
          "automatic-reference-parameters.json",
        )
      ).toString(),
    );
    check(
      "exported model uses the selected free-edge shape",
      metadata.parameters.tip_shape === "almond",
    );
    check(
      "export retains human-adjusted automatic provenance",
      metadata.source_measurement.contour_source ===
        "automatic_human_adjusted" &&
        metadata.source_measurement.contour_proposal?.points.length === 12,
    );
    check(
      "original automatic proposal stays unchanged in the audit record",
      metadata.source_measurement.contour_proposal.points.every(
        (p, i) => Math.hypot(p.x - original[i].x, p.y - original[i].y) < 0.01,
      ),
    );
    check(
      "no backend or external image-analysis API is called",
      result.backend_requests.length === 0,
    );
    check(
      "no unhandled errors in the live workflow",
      result.errors.length === 0,
    );
    await page
      .locator(".workflow-nav")
      .getByRole("button", { name: /Professional review/ })
      .click();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Delete session", exact: true })
      .click();
    await page.waitForFunction(() => !document.querySelector(".session-row"));
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.failure = error.message;
    throw error;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.writeFileSync(
      path.join(artifacts, "live-capture-results.json"),
      JSON.stringify(result, null, 2),
    );
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
