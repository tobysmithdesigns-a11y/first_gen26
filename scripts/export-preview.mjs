import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.argv[2] || `${root}/dist/standalone.html`);
let html = await readFile(`${root}/index.html`, "utf8");
const productionHtml = await readFile(`${root}/dist/index.html`, "utf8");
const cssPath = productionHtml.match(/href="(\/assets\/[^"\s]+\.css)"/)[1];
let css = await readFile(`${root}/dist${cssPath}`, "utf8");

for (const path of new Set([...css.matchAll(/url\((\/assets\/[^)]+)\)/g)].map(match => match[1]))) {
  const data = await readFile(`${root}/dist${path}`);
  css = css.replaceAll(`url(${path})`, `url(data:font/woff2;base64,${data.toString("base64")})`);
}

const frames = await Promise.all(Array.from({ length: 240 }, async (_, index) => {
  const data = await readFile(`${root}/public/frames/frame-${String(index + 1).padStart(3, "0")}.jpg`);
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}));
let js = await readFile(`${root}/src/main.js`, "utf8");
js = js.replace(/^import [^\n]+;\n/gm, "");
const frameSource = "image.src = `${import.meta.env.BASE_URL}frames/frame-${padded(frame + 1)}.jpg`;";
if (!js.includes(frameSource)) throw new Error("Frame source changed; update the preview exporter.");
js = js.replace(frameSource, "image.src = window.__FORM_FIELD_FRAMES__[frame];");
if (js.includes("import.meta")) throw new Error("Standalone preview still contains a bundler dependency.");
const favicon = await readFile(`${root}/public/favicon.svg`);
html = html.replace('href="/favicon.svg"', `href="data:image/svg+xml;base64,${favicon.toString("base64")}"`);
html = html.replace("</head>", `<style>${css}</style></head>`);
html = html.replace(/<script type="module" src="\/src\/main\.js"><\/script>/,
  `<script>window.__FORM_FIELD_FRAMES__=${JSON.stringify(frames)};\n${js.replaceAll("</script", "<\\/script")}</script>`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html);
console.log(`Self-contained preview: ${output} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB)`);
