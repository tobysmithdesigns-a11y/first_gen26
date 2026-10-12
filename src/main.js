import "@fontsource-variable/dm-sans";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/playfair-display/wght-italic.css";
import "./style.css";

// Use drawn icons so controls do not depend on a platform's symbol fonts.
const arrowSvg =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
document
  .querySelectorAll(".site-header nav span, .viewer-mark")
  .forEach((element) => {
    element.innerHTML = arrowSvg;
  });
document.querySelector(".footer-note span").innerHTML =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18h12V6"/></svg>';
document.querySelector("#replay-button span").innerHTML =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg>';

const FRAME_COUNT = 240;
const MAX_CACHED = 32;
const canvas = document.querySelector("#sequence-canvas");
const context = canvas.getContext("2d", { alpha: false });
const shell = document.querySelector("#canvas-shell");
const sequence = document.querySelector("#study");
const stage = document.querySelector(".stage");
const slider = document.querySelector("#frame-slider");
const loading = document.querySelector("#loading");
const errorState = document.querySelector("#error-state");
const cache = new Map();
const pending = new Set();
const queue = [];
const failed = new Set();
let activeLoads = 0;
let targetFrame = 0;
let renderedFrame = -1;
let scrollScheduled = false;
let paintScheduled = false;
let width = 0;
let height = 0;

const chapters = [
  { title: "The surface", copy: "Where pattern meets possibility." },
  { title: "The structure", copy: "A new perspective on a familiar form." },
  { title: "The layers", copy: "Every detail, revealed from within." },
];
const chapterButtons = [...document.querySelectorAll("[data-progress]")];
const padded = (value) => String(value).padStart(3, "0");
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function paint() {
  paintScheduled = false;
  let frame = targetFrame;
  if (!cache.has(frame)) {
    const available = [...cache.keys()];
    if (!available.length) return;
    frame = available.reduce((best, candidate) =>
      Math.abs(candidate - targetFrame) < Math.abs(best - targetFrame)
        ? candidate
        : best,
    );
  }
  const image = cache.get(frame);
  if (
    renderedFrame === frame &&
    canvas.width === width &&
    canvas.height === height
  )
    return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const scale = Math.min(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  // Extend the frame's own background into the letterbox area as the sequence changes.
  context.drawImage(image, 0, 0, 1, 1, 0, 0, width, height);
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  renderedFrame = frame;
  canvas.dataset.frame = String(frame + 1);
  document.querySelector("#frame-current").textContent = padded(frame + 1);
  canvas.setAttribute(
    "aria-label",
    `${chapters[chapterFor(frame)].title}, frame ${frame + 1} of ${FRAME_COUNT}. Patterned architectural panel.`,
  );
  loading.classList.add("loaded");
  errorState.hidden = !failed.has(targetFrame);
}

function schedulePaint() {
  if (!paintScheduled) {
    paintScheduled = true;
    requestAnimationFrame(paint);
  }
}

function evict() {
  while (cache.size > MAX_CACHED) {
    const farthest = [...cache.keys()].sort(
      (a, b) => Math.abs(b - targetFrame) - Math.abs(a - targetFrame),
    )[0];
    cache.delete(farthest);
  }
}

function loadMore() {
  while (activeLoads < 4 && queue.length) {
    const frame = queue.shift();
    if (cache.has(frame) || pending.has(frame) || failed.has(frame)) continue;
    pending.add(frame);
    activeLoads++;
    const image = new Image();
    image.decoding = "async";
    image.onload = async () => {
      try {
        await image.decode();
      } catch {
        /* onload already confirms a usable image. */
      }
      cache.set(frame, image);
      evict();
      finish();
      schedulePaint();
    };
    image.onerror = () => {
      failed.add(frame);
      if (frame === targetFrame) {
        loading.classList.add("loaded");
        errorState.hidden = false;
      }
      finish();
    };
    function finish() {
      pending.delete(frame);
      activeLoads--;
      loadMore();
    }
    image.src = `${import.meta.env.BASE_URL}frames/frame-${padded(frame + 1)}.jpg`;
  }
}

function warmFrames(frame) {
  // Drop stale queued work on jumps. Keep memory bounded instead of decoding 240 full-size images.
  queue.length = 0;
  queue.push(frame);
  for (let distance = 1; distance <= 12; distance++) {
    if (frame + distance < FRAME_COUNT) queue.push(frame + distance);
    if (frame - distance >= 0) queue.push(frame - distance);
  }
  loadMore();
}

function chapterFor(frame) {
  const progress = frame / (FRAME_COUNT - 1);
  return progress < 0.4 ? 0 : progress < 0.78 ? 1 : 2;
}

function setFrame(frame) {
  frame = clamp(Math.round(frame), 0, FRAME_COUNT - 1);
  const changed = frame !== targetFrame;
  targetFrame = frame;
  slider.value = String(frame + 1);
  slider.style.setProperty(
    "--progress",
    `${(frame / (FRAME_COUNT - 1)) * 100}%`,
  );
  const chapter = chapterFor(frame);
  document.querySelector("#chapter-number").textContent = `0${chapter + 1}`;
  document.querySelector("#chapter-title").textContent =
    chapters[chapter].title;
  document.querySelector("#chapter-copy").textContent = chapters[chapter].copy;
  chapterButtons.forEach((button, index) => {
    button.classList.toggle("active", index === chapter);
    if (index === chapter) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  errorState.hidden = !failed.has(frame);
  if (changed || !cache.has(frame)) warmFrames(frame);
  schedulePaint();
}

function scrollMetrics() {
  return {
    start:
      sequence.getBoundingClientRect().top +
      window.scrollY -
      parseFloat(getComputedStyle(stage).top),
    distance: Math.max(1, sequence.offsetHeight - stage.offsetHeight),
  };
}

function syncScroll() {
  scrollScheduled = false;
  const { start, distance } = scrollMetrics();
  setFrame(
    clamp((window.scrollY - start) / distance, 0, 1) * (FRAME_COUNT - 1),
  );
}

function goToProgress(progress, smooth = false) {
  const { start, distance } = scrollMetrics();
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  window.scrollTo({
    top: start + clamp(progress, 0, 1) * distance,
    behavior: smooth && !reducedMotion ? "smooth" : "instant",
  });
  if (!smooth || reducedMotion) setFrame(progress * (FRAME_COUNT - 1));
}

window.addEventListener(
  "scroll",
  () => {
    if (!scrollScheduled) {
      scrollScheduled = true;
      requestAnimationFrame(syncScroll);
    }
  },
  { passive: true },
);

const observer = new ResizeObserver(() => {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.round(shell.clientWidth * pixelRatio);
  height = Math.round(shell.clientHeight * pixelRatio);
  renderedFrame = -1;
  schedulePaint();
  syncScroll();
});
observer.observe(shell);
slider.addEventListener("input", () =>
  goToProgress((Number(slider.value) - 1) / (FRAME_COUNT - 1)),
);
chapterButtons.forEach((button) =>
  button.addEventListener("click", () =>
    goToProgress(Number(button.dataset.progress), true),
  ),
);
document
  .querySelector("#explore-button")
  .addEventListener("click", () =>
    goToProgress(Math.min(1, targetFrame / (FRAME_COUNT - 1) + 0.12), true),
  );
document
  .querySelector("#replay-button")
  .addEventListener("click", () => goToProgress(0, true));
document.querySelector("#retry-button").addEventListener("click", () => {
  failed.delete(targetFrame);
  errorState.hidden = true;
  warmFrames(targetFrame);
});

const dialog = document.querySelector("#about-dialog");
document
  .querySelector("#about-button")
  .addEventListener("click", () => dialog.showModal());
document
  .querySelector("#close-about")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (
    event.target === dialog &&
    (event.clientX < dialog.getBoundingClientRect().left ||
      event.clientX > dialog.getBoundingClientRect().right ||
      event.clientY < dialog.getBoundingClientRect().top ||
      event.clientY > dialog.getBoundingClientRect().bottom)
  )
    dialog.close();
});
syncScroll();
