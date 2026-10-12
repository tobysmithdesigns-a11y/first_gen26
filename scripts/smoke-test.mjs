import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.TEST_URL || "http://127.0.0.1:5173";
const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
const errors = [];
let checks = 0;

function passed(message) {
  checks++;
  console.log(`PASS ${message}`);
}
async function waitFrame(page, frame) {
  await page.waitForFunction(
    (frame) => document.querySelector("canvas").dataset.frame === String(frame),
    frame,
  );
}
async function scrollFrame(page, frame) {
  await page.evaluate((frame) => {
    const sequence = document.querySelector("#study");
    const stage = document.querySelector(".stage");
    const start =
      sequence.getBoundingClientRect().top +
      scrollY -
      parseFloat(getComputedStyle(stage).top);
    const distance = sequence.offsetHeight - stage.offsetHeight;
    scrollTo(0, start + ((frame - 1) / 239) * distance);
  }, frame);
  await waitFrame(page, frame);
}
async function canvasHash(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const pixels = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let i = 0; i < pixels.length; i += 64)
      hash = (Math.imul(hash, 31) + pixels[i]) | 0;
    return hash;
  });
}

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitFrame(page, 1);
  assert.equal(
    await page
      .locator("#loading")
      .evaluate((element) => getComputedStyle(element).opacity),
    "0",
  );
  const initialHash = await canvasHash(page);
  passed("First frame is rendered on the canvas and loading completes");

  await scrollFrame(page, 120);
  assert.notEqual(await canvasHash(page), initialHash);
  assert.equal(
    await page.locator("#chapter-title").textContent(),
    "The structure",
  );
  assert.equal(await page.locator("#frame-current").textContent(), "120");
  const middleHash = await canvasHash(page);
  passed(
    "Scrolling selects frame 120, changes canvas pixels, and updates the chapter",
  );

  await scrollFrame(page, 240);
  assert.notEqual(await canvasHash(page), middleHash);
  assert.equal(
    await page.locator("#chapter-title").textContent(),
    "The layers",
  );
  passed("Last frame is reachable by scrolling");

  await scrollFrame(page, 1);
  assert.equal(await canvasHash(page), initialHash);
  passed("Reverse scrolling restores the first frame");

  await page.locator("#frame-slider").focus();
  await page.keyboard.press("ArrowRight");
  await waitFrame(page, 2);
  await page.keyboard.press("End");
  await waitFrame(page, 240);
  passed("Keyboard slider controls select the correct frames");

  await page.locator('[data-progress="0.45"]').click();
  await waitFrame(page, 109);
  assert.equal(
    await page.locator('[data-progress="0.45"]').getAttribute("aria-current"),
    "step",
  );
  passed("Chapter shortcut scrolls to its frame and marks the current chapter");

  await page.locator("#about-button").click();
  assert.equal(
    await page.locator("#about-dialog").evaluate((element) => element.open),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator("#about-dialog").evaluate((element) => element.open),
    false,
  );
  passed("About dialog opens and closes with Escape");

  await page.locator("#replay-button").scrollIntoViewIfNeeded();
  await page.locator("#replay-button").click();
  await waitFrame(page, 1);
  passed("Replay returns to the beginning");

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await scrollFrame(page, 120);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const bounds = await page.locator("#canvas-shell").boundingBox();
    assert(bounds.width > 0 && bounds.height > 0);
    await scrollFrame(page, 1);
    const footer = await page.locator(".stage-footer").boundingBox();
    assert(
      footer.y + footer.height <= viewport.height + 1,
      "Chapter controls should remain in the viewport",
    );
  }
  passed(
    "Canvas and chapter controls fit phone, small phone, and landscape layouts",
  );

  // An actual failed asset must expose a retry, then recover after the connection is restored.
  const failurePage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  failurePage.on("pageerror", (error) => errors.push(error.message));
  await failurePage.route("**/frames/frame-220.jpg", (route) => route.abort());
  await failurePage.goto(baseUrl, { waitUntil: "networkidle" });
  await waitFrame(failurePage, 1);
  await failurePage.locator("#frame-slider").evaluate((element) => {
    element.value = "220";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await failurePage.locator("#retry-button").waitFor({ state: "visible" });
  await failurePage.unroute("**/frames/frame-220.jpg");
  await failurePage.locator("#retry-button").click();
  await waitFrame(failurePage, 220);
  assert.equal(await failurePage.locator("#error-state").isVisible(), false);
  passed("A failed frame shows a retry and successfully recovers");

  assert.deepEqual(errors, []);
  passed("No uncaught browser errors");
  console.log(`\n${checks} browser checks passed.`);
} finally {
  await browser.close();
}
