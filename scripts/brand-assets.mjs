// Writes the app's icons from the original logo PNG (assets/brand/plexbie-512.png) and
// the TV silhouette drawn below. No other artwork: the logo is the brand.
//
//   node scripts/brand-assets.mjs
//
//   icon-1024.png              iOS app icon: the logo, opaque (iOS rounds the corners)
//   adaptive-foreground.png    Android adaptive icon: the logo inside the 72dp the launcher
//                              shows, its own background carried out to the 108dp edges, so
//                              any mask shape (circle, squircle) crops background, not art
//   adaptive-monochrome.png    Android 13+ themed icon: the TV as a silhouette
//   notification-96.png        the small icon in Android's status bar: white on transparent
//   splash-rounded.png         the launch screen's logo: the logo with softly rounded corners,
//                              transparent outside them (the app's launch overlay uses it too)
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const brand = new URL("../assets/brand/", import.meta.url);

/** Plexbie's TV: antennae, the set, a screen cut out of it, its face. Same as the website's badge. */
const TV = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">
  <g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round">
    <path d="M38 27 C33 18 27 13 20 12" /><path d="M58 27 C63 18 69 13 76 12" />
  </g>
  <circle cx="18" cy="12" r="5" fill="#fff" /><circle cx="78" cy="12" r="5" fill="#fff" />
  <path fill="#fff" fill-rule="evenodd" d="
    M22 26 h52 a14 14 0 0 1 14 14 v32 a14 14 0 0 1 -14 14 h-52 a14 14 0 0 1 -14 -14 v-32 a14 14 0 0 1 14 -14 z
    M27 35 h42 a7 7 0 0 1 7 7 v28 a7 7 0 0 1 -7 7 h-42 a7 7 0 0 1 -7 -7 v-28 a7 7 0 0 1 7 -7 z" />
  <circle cx="38" cy="52" r="4" fill="#fff" /><circle cx="58" cy="52" r="4" fill="#fff" />
  <path d="M42 60 q3 4 6 0 q3 4 6 0" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();

async function svgPng(svg, size, inset = 0) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - inset * 2;
  await page.setContent(`<style>html,body{margin:0;background:transparent}div{width:${size}px;height:${size}px;display:grid;place-items:center}</style><div>${svg(inner)}</div>`);
  return page.locator("div").screenshot({ omitBackground: true });
}

/** The logo at `logoFrac` of `visibleFrac` of an N×N canvas, its edges stretched to fill the rest. */
async function logoPng(N, visibleFrac, logoFrac) {
  const src = readFileSync(new URL("plexbie-512.png", brand)).toString("base64");
  const b64 = await page.evaluate(async ({ src, N, visibleFrac, logoFrac }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const S = Math.round(N * visibleFrac * logoFrac), o = (N - S) / 2, w = img.width;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    const d = (sx, sy, sw, sh, dx, dy, dw, dh) => g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    if (o > 0) {
      d(0, 0, w, 1, o, 0, S, o); d(0, w - 1, w, 1, o, o + S, S, o);
      d(0, 0, 1, w, 0, o, o, S); d(w - 1, 0, 1, w, o + S, o, o, S);
      d(0, 0, 1, 1, 0, 0, o, o); d(w - 1, 0, 1, 1, o + S, 0, o, o);
      d(0, w - 1, 1, 1, 0, o + S, o, o); d(w - 1, w - 1, 1, 1, o + S, o + S, o, o);
    }
    g.drawImage(img, o, o, S, S);
    const px = g.getImageData(0, 0, N, N);
    for (let i = 3; i < px.data.length; i += 4) px.data[i] = 255;   // icons are opaque
    g.putImageData(px, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  }, { src, N, visibleFrac, logoFrac });
  return Buffer.from(b64, "base64");
}

/** The logo with rounded corners (radiusFrac of its width), transparent outside them. */
async function roundedPng(N, radiusFrac) {
  const src = readFileSync(new URL("plexbie-512.png", brand)).toString("base64");
  const b64 = await page.evaluate(async ({ src, N, radiusFrac }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.beginPath();
    g.roundRect(0, 0, N, N, N * radiusFrac);
    g.clip();
    g.drawImage(img, 0, 0, N, N);
    return c.toDataURL("image/png").split(",")[1];
  }, { src, N, radiusFrac });
  return Buffer.from(b64, "base64");
}

if (process.argv.includes("--splash-only")) {
  writeFileSync(new URL("splash-rounded.png", brand), await roundedPng(512, 0.24));
  await browser.close();
  console.log("splash-rounded written");
  process.exit(0);
}
writeFileSync(new URL("splash-rounded.png", brand), await roundedPng(512, 0.24));
writeFileSync(new URL("icon-1024.png", brand), await logoPng(1024, 1, 1));
// Adaptive: 108dp layer, ~72dp shown through the mask (2/3); the logo at 84% of that.
writeFileSync(new URL("adaptive-foreground.png", brand), await logoPng(1024, 2 / 3, 0.84));
// Themed icon: the silhouette inside the 66dp safe circle.
writeFileSync(new URL("adaptive-monochrome.png", brand), await svgPng(TV, 1024, 1024 * 0.3));
writeFileSync(new URL("notification-96.png", brand), await svgPng(TV, 96));

await browser.close();
console.log("icon-1024, adaptive-foreground, adaptive-monochrome, notification-96 written");
