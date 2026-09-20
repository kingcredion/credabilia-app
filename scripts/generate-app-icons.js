// Generates all app-icon store exports from the single source master art.
// Run with: node scripts/generate-app-icons.js
//
// Source of truth: public/brand/app-icons/king-credion-app-icon-source-v1.png (never overwritten).
// Everything below is derived and safe to regenerate.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'public/brand/app-icons/king-credion-app-icon-source-v1.png');
const OUT = path.join(ROOT, 'public/brand/app-icons');
const BRAND_GREEN = { r: 23, g: 63, b: 54 }; // #173f36, the app's own --green

async function ensureDir(p) { await mkdir(p, { recursive: true }); }

// Flood-fills the background from all four corners using color-distance from the sampled
// background reference, so we never mistake interior dark pixels (eyebrows, crown shadow) for
// background -- only pixels actually *contiguous* with the border get classified as background.
function floodFillBackground(data, w, h, channels, ref, tolerance) {
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { if (x >= 0 && x < w && y >= 0 && y < h) stack.push(x, y); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    const idx = y * w + x;
    if (bg[idx]) continue;
    const i = idx * channels;
    const dr = data[i] - ref.r, dg = data[i + 1] - ref.g, db = data[i + 2] - ref.b;
    if (dr * dr + dg * dg + db * db > tol2) continue;
    bg[idx] = 1;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return bg;
}

function boundingBoxOfForeground(bg, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bg[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function main() {
  const image = sharp(SRC);
  const meta = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  console.log(`source: ${w}x${h}, ${c} channels, alpha=${meta.hasAlpha}`);

  const bg = floodFillBackground(data, w, h, c, BRAND_GREEN, 32);
  const bbox = boundingBoxOfForeground(bg, w, h);
  const cx = bbox.x0 + bbox.w / 2, cy = bbox.y0 + bbox.h / 2;
  console.log('foreground bbox', bbox, 'center', { cx, cy });

  // Flat, opaque, background-normalized version at native resolution (character pixels
  // untouched; every background pixel forced to the exact brand green).
  const flat = Buffer.from(data);
  for (let p = 0; p < w * h; p++) {
    if (bg[p]) { const i = p * c; flat[i] = BRAND_GREEN.r; flat[i + 1] = BRAND_GREEN.g; flat[i + 2] = BRAND_GREEN.b; }
  }
  const flatImg = sharp(flat, { raw: { width: w, height: h, channels: c } });

  // Transparent cutout of the character alone (alpha=0 on background), used only for the
  // Android adaptive-icon foreground layer, which composites over a separate background layer.
  const cutout = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const i = p * c, o = p * 4;
    cutout[o] = data[i]; cutout[o + 1] = data[i + 1]; cutout[o + 2] = data[i + 2];
    cutout[o + 3] = bg[p] ? 0 : 255;
  }
  const cutoutImg = sharp(cutout, { raw: { width: w, height: h, channels: 4 } });

  // Renders `source` (flat or cutout) scaled so the character's bbox measurement (its larger
  // side for plain square icons, or its diagonal when a circular safe zone must contain every
  // corner) equals `targetSize`, centered on a `canvas`x`canvas` background of `bgColor` (or
  // transparent).
  async function renderCentered(source, canvas, targetSize, bgColor, metric = 'maxDim') {
    const measurement = metric === 'diagonal' ? Math.hypot(bbox.w, bbox.h) : Math.max(bbox.w, bbox.h);
    const scale = targetSize / measurement;
    const scaledW = Math.round(w * scale), scaledH = Math.round(h * scale);
    const resized = await source.clone().resize(scaledW, scaledH).png().toBuffer();
    const scaledCx = cx * scale, scaledCy = cy * scale;
    const left = Math.round(canvas / 2 - scaledCx), top = Math.round(canvas / 2 - scaledCy);
    return sharp({ create: { width: canvas, height: canvas, channels: 4, background: bgColor ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: resized, left, top }]);
  }

  await ensureDir(path.join(OUT, 'master'));
  await ensureDir(path.join(OUT, 'ios'));
  await ensureDir(path.join(OUT, 'android/adaptive'));
  await ensureDir(path.join(OUT, 'android/legacy'));
  await ensureDir(path.join(OUT, 'web'));
  await ensureDir(path.join(OUT, 'preview'));

  const opaqueGreen = { r: BRAND_GREEN.r, g: BRAND_GREEN.g, b: BRAND_GREEN.b, alpha: 1 };

  // --- Master: 1024x1024, character ~70% of frame (diagonal ~= 0.70 * 1024), fully opaque ---
  const master1024 = path.join(OUT, 'master/king-credion-icon-master-1024.png');
  await (await renderCentered(flatImg, 1024, 0.70 * 1024, opaqueGreen)).flatten({ background: BRAND_GREEN }).removeAlpha().png({ compressionLevel: 9 }).toFile(master1024);

  // --- iOS: single 1024 source, no alpha channel (Xcode "Single Size" asset catalog) ---
  await sharp(master1024).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'ios/AppIcon-1024.png'));

  // --- Android adaptive icon: two 432x432 (108dp @4x) layers ---
  // Foreground: character only, must fit inside the 66/108 safe-zone circle (radius 132px @432).
  // Target diagonal a bit inside the full safe circle (264px) for a comfortable margin.
  await (await renderCentered(cutoutImg, 432, 230, null, 'diagonal')).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'android/adaptive/ic_launcher_foreground.png'));
  await sharp({ create: { width: 432, height: 432, channels: 4, background: opaqueGreen } }).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'android/adaptive/ic_launcher_background.png'));

  // --- Android legacy launcher icons (non-adaptive, pre-Android-8 devices) ---
  const legacySizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, size] of Object.entries(legacySizes)) {
    const dir = path.join(OUT, `android/legacy/mipmap-${density}`);
    await ensureDir(dir);
    await sharp(master1024).resize(size, size).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(dir, 'ic_launcher.png'));
  }

  // --- PWA / web manifest icons ---
  // "any" purpose: same 70%-occupancy master, just resized.
  await sharp(master1024).resize(192, 192).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/icon-192.png'));
  await sharp(master1024).resize(512, 512).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/icon-512.png'));
  // "maskable" purpose: single flat opaque image, content inside the central 80% safe zone
  // (409px circle in a 512 canvas) since there's no separate OS-supplied background layer here.
  const maskable512 = await renderCentered(flatImg, 512, 0.78 * 409, opaqueGreen, 'diagonal');
  await maskable512.flatten({ background: BRAND_GREEN }).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/icon-maskable-512.png'));
  // Safari ignores the manifest for home-screen icons and reads its own opaque, square tag.
  await sharp(master1024).resize(180, 180).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/apple-touch-icon-180.png'));
  await sharp(master1024).resize(32, 32).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/favicon-32.png'));
  await sharp(master1024).resize(16, 16).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/favicon-16.png'));

  // --- Clipping-check previews: overlay the actual safe-zone/mask shapes so we can eyeball them ---
  async function circleMaskPreview(imgPath, canvas, radius, outPath, showSafeRing) {
    const svg = Buffer.from(
      `<svg width="${canvas}" height="${canvas}"><circle cx="${canvas / 2}" cy="${canvas / 2}" r="${radius}" fill="none" stroke="red" stroke-width="3"/>${showSafeRing ? `<circle cx="${canvas / 2}" cy="${canvas / 2}" r="${canvas / 2 - 2}" fill="none" stroke="yellow" stroke-width="2" stroke-dasharray="6,6"/>` : ''}</svg>`
    );
    await sharp(imgPath).resize(canvas, canvas).composite([{ input: svg }]).png().toFile(outPath);
  }
  await circleMaskPreview(path.join(OUT, 'android/adaptive/ic_launcher_foreground.png'), 432, 132, path.join(OUT, 'preview/android-foreground-safezone.png'), true);
  const composedAdaptive = sharp(path.join(OUT, 'android/adaptive/ic_launcher_background.png')).composite([{ input: path.join(OUT, 'android/adaptive/ic_launcher_foreground.png') }]);
  await composedAdaptive.toFile(path.join(OUT, 'preview/android-adaptive-composed-flat.png'));
  await circleMaskPreview(path.join(OUT, 'preview/android-adaptive-composed-flat.png'), 432, 216, path.join(OUT, 'preview/android-adaptive-circle-mask.png'), false);
  await circleMaskPreview(path.join(OUT, 'web/icon-maskable-512.png'), 512, 204.5, path.join(OUT, 'preview/pwa-maskable-safezone.png'), true);
  const iosSvgMask = Buffer.from(`<svg width="1024" height="1024"><rect x="2" y="2" width="1020" height="1020" rx="228" ry="228" fill="none" stroke="red" stroke-width="6"/></svg>`);
  await sharp(master1024).composite([{ input: iosSvgMask }]).png().toFile(path.join(OUT, 'preview/ios-superellipse-mask.png'));

  console.log('done');
}

main().catch(err => { console.error(err); process.exit(1); });
