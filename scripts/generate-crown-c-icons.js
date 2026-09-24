// Generates the full favicon / app-icon export set from the approved crowned-"C" master art.
// Run with: node scripts/generate-crown-c-icons.js
//
// Source of truth: public/brand/credabilia-crown-c-favicon-gradient-v2.png (never overwritten,
// already a clean transparent cutout -- no flood-fill background detection needed, unlike the
// earlier King Credion icon source which was shot on a solid green background).
// Everything under public/brand/app-icons/crown-c/ is derived and safe to regenerate.
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'public/brand/credabilia-crown-c-favicon-gradient-v2.png');
const OUT = path.join(ROOT, 'public/brand/app-icons/crown-c');
const BRAND_GREEN = { r: 23, g: 63, b: 54 }; // #173f36, the app's own --green (theme-color/manifest)

async function ensureDir(p) { await mkdir(p, { recursive: true }); }

function boundingBoxOfAlpha(data, w, h, channels, alphaThreshold = 10) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = data[(y * w + x) * channels + 3];
    if (a > alphaThreshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function main() {
  const image = sharp(SRC);
  const meta = await image.metadata();
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  console.log(`source: ${w}x${h}, ${c} channels, alpha=${meta.hasAlpha}`);

  const bbox = boundingBoxOfAlpha(data, w, h, c);
  const cx = bbox.x0 + bbox.w / 2, cy = bbox.y0 + bbox.h / 2;
  console.log('foreground bbox', bbox, 'center', { cx, cy }, 'aspect', (bbox.w / bbox.h).toFixed(3));

  // The source is already a clean transparent cutout -- use it directly for anything that wants
  // transparency (Android adaptive foreground), and a flattened opaque-brand-green version for
  // anything that must not have alpha (iOS/Play store icons, legacy Android, favicons).
  const cutoutImg = sharp(SRC).ensureAlpha();
  const flatImg = sharp(SRC).flatten({ background: BRAND_GREEN });

  // Renders `source` scaled so the character's bbox measurement (its larger side for plain
  // square icons, or its diagonal when a circular safe zone must contain every corner) equals
  // `targetSize`, centered on a `canvas`x`canvas` background of `bgColor` (or transparent).
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

  for (const dir of ['master', 'ios', 'android/adaptive', 'android/legacy', 'web', 'store/ios', 'store/google-play', 'preview']) {
    await ensureDir(path.join(OUT, dir));
  }

  const opaqueGreen = { r: BRAND_GREEN.r, g: BRAND_GREEN.g, b: BRAND_GREEN.b, alpha: 1 };

  // --- Master: 1024x1024, mark ~70% of frame (comfortable margin, matches the existing King
  // Credion icon convention), fully opaque brand-green background. Never rounded here -- every
  // consumer (OS, browser, store) applies its own mask/corner-radius at render time. ---
  const master1024 = path.join(OUT, 'master/credabilia-crown-c-master-1024.png');
  await (await renderCentered(flatImg, 1024, 0.70 * 1024, opaqueGreen)).flatten({ background: BRAND_GREEN }).removeAlpha().png({ compressionLevel: 9 }).toFile(master1024);

  // --- iOS (general Xcode asset catalog use): single 1024 source, no alpha channel ---
  await sharp(master1024).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'ios/AppIcon-1024.png'));
  // --- iOS App Store Connect marketing icon: identical spec (1024x1024, opaque, square corners
  // -- Apple's own upload pipeline applies the superellipse mask, so a pre-rounded file is rejected) ---
  await sharp(master1024).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'store/ios/AppStore-1024.png'));

  // --- Google Play Store high-res listing icon: 512x512, 32-bit PNG. Play Console's current spec
  // allows alpha, but we ship it opaque brand-green like the App Store icon for a consistent,
  // launcher-safe result regardless of which surface renders it. ---
  await sharp(master1024).resize(512, 512).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'store/google-play/PlayStore-icon-512.png'));

  // --- Android adaptive icon: two 432x432 (108dp @4x) layers ---
  // Foreground: mark only, transparent, must fit inside the 66/108 safe-zone circle (diameter
  // 66dp -> radius 132px @432). Target diagonal a bit inside the full safe circle for margin.
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
  // "maskable" purpose: flat opaque image, content inside the central safe zone (an inscribed
  // circle covering ~80% of the icon, per the W3C maskable-icon guidance) since there's no
  // separate OS-supplied background layer here.
  const maskable512 = await renderCentered(flatImg, 512, 0.78 * 409, opaqueGreen, 'diagonal');
  await maskable512.flatten({ background: BRAND_GREEN }).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/icon-maskable-512.png'));
  // Safari ignores the manifest for home-screen icons and reads its own opaque, square tag.
  await sharp(master1024).resize(180, 180).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/apple-touch-icon-180.png'));
  await sharp(master1024).resize(48, 48).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/favicon-48.png'));
  await sharp(master1024).resize(32, 32).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/favicon-32.png'));
  await sharp(master1024).resize(16, 16).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'web/favicon-16.png'));

  // --- favicon.ico: bundles 16/32/48 into one multi-resolution file, written both into the
  // documented export folder and to the site root, which is where browsers request it by
  // convention even without an explicit <link rel="icon"> pointing elsewhere. ---
  const icoBuffer = await pngToIco([
    path.join(OUT, 'web/favicon-16.png'),
    path.join(OUT, 'web/favicon-32.png'),
    path.join(OUT, 'web/favicon-48.png'),
  ]);
  await writeFile(path.join(OUT, 'web/favicon.ico'), icoBuffer);
  await writeFile(path.join(ROOT, 'public/favicon.ico'), icoBuffer);

  // --- Clipping-check previews: overlay the actual safe-zone/mask shapes so we can eyeball
  // whether the crown survives circular and rounded-square cropping at each surface. ---
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
  // Small-size legibility check: the two smallest real render targets side by side at native size.
  const favSheet = sharp({ create: { width: 16 + 8 + 32, height: 32, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      { input: path.join(OUT, 'web/favicon-16.png'), left: 0, top: 8 },
      { input: path.join(OUT, 'web/favicon-32.png'), left: 24, top: 0 },
    ]);
  await favSheet.png().toFile(path.join(OUT, 'preview/favicon-small-sizes.png'));

  console.log('done');
}

main().catch(err => { console.error(err); process.exit(1); });
