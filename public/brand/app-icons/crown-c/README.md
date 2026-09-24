# Crowned "C" icon set

Generated from the approved source art:
`public/brand/credabilia-crown-c-favicon-gradient-v2.png` (1254x1254, transparent, blue-gold-green
gradient C with gold crown). That source file is never modified -- everything in this folder is
derived from it by `scripts/generate-crown-c-icons.js` and is safe to regenerate at any time by
re-running that script.

This is now the site's live favicon and app icon (wired into `index.html`, `public/manifest.json`,
and the push-notification icon in `src/sw.js`). The website's full wordmark logo and the "Memorabilia
Kingdom" tagline are separate assets and were not touched by this work.

## Design decisions

- **Occupancy**: the mark fills ~70% of each square canvas (measured corner-to-corner), leaving a
  comfortable margin on every masked/cropped surface -- same convention as the prior King Credion
  icon set.
- **Opaque background**: `#173f36`, the app's own brand green (already the `theme-color` in
  `index.html` and `theme_color` in the manifest), used everywhere a platform requires no alpha
  channel (iOS, Android legacy/adaptive-background, Play Store, favicons, maskable PWA).
- **No pre-baked corners**: the master and every derived square icon has hard square corners.
  Every consumer (iOS's superellipse, Android's circle/squircle/rounded-square masks, browser
  favicon UI) applies its own mask at render time -- baking rounding into the source would double
  up with, or fight against, that.
- **Crop safety**: verified against both a circular mask (Android adaptive icon's worst case) and
  Apple's superellipse mask -- see `preview/`. The crown clears both with margin to spare.

## Folder contents

| Path | Size | Alpha | Intended use |
|---|---|---|---|
| `master/credabilia-crown-c-master-1024.png` | 1024x1024 | no | Source-of-truth for every derived square icon below. Not referenced directly by the app. |
| `web/favicon.ico` (+ copy at `public/favicon.ico`) | 16/32/48 multi-res | no | Classic favicon; served at the site root so browsers find it by convention even without a `<link>`. |
| `web/favicon-16.png`, `web/favicon-32.png` | 16x16, 32x32 | no | `<link rel="icon">` in `index.html`, for browsers that prefer PNG over ICO. |
| `web/favicon-48.png` | 48x48 | no | Embedded into `favicon.ico`; not referenced standalone. |
| `web/apple-touch-icon-180.png` | 180x180 | no | `<link rel="apple-touch-icon">` -- iOS/iPadOS home-screen bookmark icon (Safari ignores the manifest for this). |
| `web/icon-192.png` | 192x192 | no | `manifest.json` icon, `purpose: "any"`; also the push-notification icon/badge in `src/sw.js`. |
| `web/icon-512.png` | 512x512 | no | `manifest.json` icon, `purpose: "any"` (splash screen generation, larger installed-PWA contexts). |
| `web/icon-maskable-512.png` | 512x512 | no | `manifest.json` icon, `purpose: "maskable"` -- mark sits inside the ~80% safe-zone circle so Android/Chrome can apply any mask shape without clipping it. |
| `ios/AppIcon-1024.png` | 1024x1024 | no | General-purpose source for an Xcode asset catalog (single-size icon), if/when a native iOS shell is built. |
| `store/ios/AppStore-1024.png` | 1024x1024 | no | App Store Connect marketing icon upload. Identical spec to `ios/AppIcon-1024.png`, kept as a separate clearly-labeled file for the store-submission step. **Not yet submitted.** |
| `store/google-play/PlayStore-icon-512.png` | 512x512 | no | Google Play Console "high-res icon" store-listing upload. Play's current spec permits alpha, but this is shipped opaque brand-green for a consistent result across every launcher/surface. **Not yet submitted.** |
| `android/adaptive/ic_launcher_foreground.png` | 432x432 | **yes** | Android adaptive-icon foreground layer (108dp canvas @4x). Transparent outside the mark; the OS composites this over a separate background layer and applies its own mask shape per device/launcher. |
| `android/adaptive/ic_launcher_background.png` | 432x432 | no | Android adaptive-icon background layer -- flat brand green. |
| `android/legacy/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` | 48-192px | no | Pre-Android-8 (non-adaptive) launcher icons, one per density bucket. |
| `preview/*.png` | various | mixed | Not shipped/referenced by the app -- visual QA only, showing the mark against the actual iOS superellipse mask, Android adaptive safe-zone/circle mask, the composed adaptive icon, the PWA maskable safe zone, and the two smallest favicon sizes side by side for a legibility check. |

## Regenerating

```
node scripts/generate-crown-c-icons.js
```

Requires the `sharp` and `png-to-ico` packages (already in `devDependencies`). Re-running is
idempotent -- it always starts from the untouched source PNG.
