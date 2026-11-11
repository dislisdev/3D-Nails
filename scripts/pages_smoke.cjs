/* Exercise the deployed static edition without any Python/API server. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
const frontendRequire = createRequire(path.join(root, "frontend/package.json"));
const { chromium } = frontendRequire("playwright");
const AxeBuilder = frontendRequire("@axe-core/playwright").default;
const dist = path.join(root, "frontend/dist");
const artifacts = path.join(root, "artifacts");
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, "tests/fixtures/planar-reference.json")),
);
const imagePath = path.join(root, "tests/fixtures/planar-reference.png");
const prefix = "/3D-Nails/";
const results = {
  run_at: new Date().toISOString(),
  status: "running",
  checks: [],
  errors: [],
  backend_requests: [],
  accessibility: [],
  synthetic: true,
};
fs.mkdirSync(artifacts, { recursive: true });

function check(name, condition = true) {
  assert(condition, name);
  results.checks.push(name);
  console.log("PASS", name);
}
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  if (!pathname.startsWith(prefix)) {
    response.writeHead(404).end();
    return;
  }
  const filename = path.resolve(
    dist,
    pathname.slice(prefix.length) || "index.html",
  );
  if (
    !filename.startsWith(dist + path.sep) ||
    !fs.existsSync(filename) ||
    !fs.statSync(filename).isFile()
  ) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": mime[path.extname(filename)] || "application/octet-stream",
  });
  fs.createReadStream(filename).pipe(response);
});

async function movePoint(page, index, point) {
  const handle = page.locator("circle.contour-handle").nth(index);
  await handle.scrollIntoViewIfNeeded();
  const bounds = await handle.boundingBox();
  const destination = await imagePoint(page, point);
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 4 });
  await page.mouse.up();
}
async function imagePoint(page, point) {
  const svg = page.locator(".image-editor > svg");
  await svg.scrollIntoViewIfNeeded();
  return svg.evaluate((element, point) => {
    const transformed = new DOMPoint(point.x, point.y).matrixTransform(
      element.getScreenCTM(),
    );
    return { x: transformed.x, y: transformed.y };
  }, point);
}
async function download(page, link, filename) {
  const event = page.waitForEvent("download");
  await link.click();
  const file = await event;
  await file.saveAs(path.join(artifacts, filename));
  return fs.readFileSync(path.join(artifacts, filename));
}
async function screenshot(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: path.join(artifacts, name + ".png"),
    fullPage: true,
  });
}

(async () => {
  assert(
    fs.existsSync(path.join(dist, "index.html")),
    "Run npm --prefix frontend run build:pages first.",
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const local = `http://127.0.0.1:${server.address().port}${prefix}`;
  const target = process.env.NAILFORM_PAGES_URL || local;
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
  const page = await context.newPage();
  page.on("pageerror", (error) => results.errors.push(error.message));
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.startsWith("/api/") ||
      request.url().includes("/3D-Nails/api/")
    )
      results.backend_requests.push(request.url());
  });
  try {
    await page.goto(target);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("heading", { name: /Designed for/ }).waitFor();
    check("static assets load under the GitHub project subpath");
    await screenshot(page, "pages-desktop-landing");
    await page
      .getByRole("button", { name: "Start measurement", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Session name")
      .fill("Synthetic GitHub Pages workflow");
    check(
      "research storage consent is required",
      await dialog
        .getByRole("button", { name: "Enter the measurement lab" })
        .isDisabled(),
    );
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Enter the measurement lab" })
      .click();

    await page
      .getByRole("button", { name: "Open camera", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("video")?.readyState >= 2,
    );
    check(
      "native camera preview works in static edition using a synthetic device",
    );
    await page
      .getByRole("button", { name: "Capture photograph", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Replace image", exact: true })
      .waitFor();
    check("camera capture saved locally without a server");
    const firstImage = await page
      .locator(".capture-stage img")
      .getAttribute("src");
    await page.getByLabel("Upload nail photograph").setInputFiles(imagePath);
    await page.waitForFunction((old) => {
      const image = document.querySelector(".capture-stage img");
      return image?.getAttribute("src") !== old && image?.complete;
    }, firstImage);
    check("uploaded replacement is shown instead of the old capture");
    await page
      .getByRole("button", { name: "Calibrate & trace", exact: true })
      .click();
    check(
      "calibration gates measurement",
      await page.getByRole("button", { name: "Save & measure" }).isDisabled(),
    );
    await page.getByLabel("Known reference length").fill("5");
    for (const [key, label] of [
      ["a", "Set A · start"],
      ["b", "Set B · end"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      const point = await imagePoint(page, fixture.calibration[key]);
      await page.mouse.click(point.x, point.y);
    }
    await page.getByRole("button", { name: "Outline", exact: true }).click();
    for (let index = 0; index < fixture.contour.length; index++)
      await movePoint(page, index, fixture.contour[index]);
    await page.getByLabel("I placed the scale", { exact: false }).check();
    await page
      .getByLabel("I have manually reviewed all twelve", { exact: false })
      .check();
    await page.getByRole("button", { name: "Save & measure" }).click();
    await page.locator("#length_mm").waitFor();
    check(
      "browser computes the independent 16 mm projected length",
      Math.abs(Number(await page.locator("#length_mm").inputValue()) - 16) <
        0.02,
    );
    check(
      "browser computes the independent 10 mm projected width",
      Math.abs(Number(await page.locator("#width_mm").inputValue()) - 10) <
        0.02,
    );
    await page
      .getByLabel("I have reviewed the 2D measurements", { exact: false })
      .check();
    await page
      .getByRole("button", { name: "Generate laboratory model" })
      .click();
    await page.locator(".viewer canvas").waitFor();
    check("actual browser-generated shell renders without Python");
    await page.getByRole("link", { name: "STL", exact: true }).waitFor();
    const stl = await download(
      page,
      page.getByRole("link", { name: "STL", exact: true }),
      "pages-reference.stl",
    );
    const step = await download(
      page,
      page.getByRole("link", { name: "STEP", exact: true }),
      "pages-reference.step",
    );
    check(
      "binary STL contains generated triangles",
      stl.length > 1000 && stl.length === 84 + stl.readUInt32LE(80) * 50,
    );
    check(
      "STEP is an actual faceted boundary representation",
      step.toString().startsWith("ISO-10303-21;") &&
        step.toString().includes("FACETED_BREP"),
    );
    const parameterLink = page
      .getByRole("link", { name: /Parameters JSON/ })
      .first();
    const parameterData = JSON.parse(
      (
        await download(page, parameterLink, "pages-reference-parameters.json")
      ).toString(),
    );
    check(
      "export retains measured dimension provenance",
      (
        parameterData.parameter_provenance ||
        parameterData.metadata?.parameter_provenance
      )?.length_mm === "measured",
    );
    check(
      "export retains unknown measured curvature",
      parameterData.source_measurement?.provenance?.transverse_rise_mm ===
        "unknown",
    );
    check(
      "browser CAD engine is labelled as faceted",
      parameterData.metadata?.geometry_kind === "faceted_parametric_shell",
    );
    const reportLink = page
      .getByRole("link", { name: /Validation report/ })
      .first();
    const report = JSON.parse(
      (
        await download(page, reportLink, "pages-reference-report.json")
      ).toString(),
    );
    check(
      "implemented browser topology validation passes",
      report.passed === true,
    );
    check(
      "report does not claim an independent global intersection proof",
      report.self_intersections_independently_verified === false,
    );
    results.parameters = parameterData;
    results.validation = report;
    await screenshot(page, "pages-desktop-geometry");
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    results.accessibility = accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    }));
    check(
      "generated-model screen has no automated WCAG violations",
      accessibility.violations.length === 0,
    );

    await page
      .getByRole("button", { name: "Professional review", exact: true })
      .click();
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
      .getByLabel("Notes & reference observations")
      .fill(
        "Synthetic browser-only demonstration; no physical fit or wear validation.",
      );
    await page
      .getByRole("button", { name: "Save professional review", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review saved", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    await page
      .getByLabel("Observation at this point")
      .fill("Synthetic distal observation in IndexedDB.");
    await page
      .getByRole("button", { name: "Save photo note", exact: true })
      .click();
    await page.locator(".annotation-notes li").waitFor();
    check("photo annotations persist in browser storage");
    await page.reload();
    await page
      .getByRole("button", { name: "Research journal", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Synthetic GitHub Pages workflow",
        exact: true,
      })
      .waitFor();
    check("saved browser session survives a reload");
    await page.locator(".session-open").first().click();
    await page.locator(".viewer canvas").waitFor();
    check("stored geometry is restored after reload");
    const restoredSTL = await download(
      page,
      page.getByRole("link", { name: "STL", exact: true }),
      "pages-reference-restored.stl",
    );
    check(
      "download Blob URLs are regenerated correctly after reload",
      Buffer.compare(stl, restoredSTL) === 0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, "pages-mobile-geometry");
    check(
      "mobile Pages workflow has no horizontal overflow",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .locator(".workflow-nav")
      .getByRole("button", { name: /Calibrate & trace/ })
      .click();
    await screenshot(page, "pages-mobile-calibration");
    check(
      "stored photo is restored after reload",
      (await page.locator(".image-editor image").getAttribute("href")) !== null,
    );
    const isolated = await browser.newContext();
    const isolatedPage = await isolated.newPage();
    await isolatedPage.goto(target);
    await isolatedPage
      .getByRole("button", { name: "Research journal", exact: true })
      .click();
    check(
      "another browser context has no access to local research records",
      (await isolatedPage
        .getByRole("heading", {
          name: "Synthetic GitHub Pages workflow",
          exact: true,
        })
        .count()) === 0,
    );
    await isolated.close();
    await page
      .locator(".workflow-nav")
      .getByRole("button", { name: /Professional review/ })
      .click();
    await page
      .getByRole("button", { name: "Delete session", exact: true })
      .waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Delete session", exact: true })
      .click();
    await page.waitForFunction(() => !document.querySelector(".session-row"));
    check("deletion removes the local research session");
    check(
      "Pages workflow makes no backend API requests",
      results.backend_requests.length === 0,
    );
    check(
      "Pages workflow has no unhandled browser errors",
      results.errors.length === 0,
    );
    results.status = "passed";
  } catch (error) {
    results.status = "failed";
    results.failure = error.message;
    throw error;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(
      path.join(artifacts, "pages-browser-results.json"),
      JSON.stringify(results, null, 2),
    );
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
