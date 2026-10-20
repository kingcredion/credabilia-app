// Quality check for a Photoroom cutout: how much of the picture is still there?
// When the subject is unclear (a close-up of a hologram on a large framed photo, say) the cutout can keep only a small patch and make everything
// else see-through, so the listing's main photo turns into a blur. We read the PNG's alpha channel and measure the share of pixels that stayed opaque.
// Reads 8-bit RGBA / gray+alpha PNGs (what Photoroom returns). Anything else returns null, meaning "cannot judge" -- the caller keeps its old behaviour.
// A copy of this file lives in ../retry-background-removal/ (each function deploys as its own bundle); tests/cutoutQuality.test.js keeps them identical.

// Below this the cutout is treated as a failure and the original photo is kept. Measured on real listings: the distorted one kept 4.4% of its pixels,
// and the 32 healthy main photos kept 10.4% (a signed baseball, genuinely small) up to 84%. A tiny item caught by mistake just keeps its original photo.
export const MIN_KEPT_SHARE = 0.07;
export const MAX_PIXELS = 8_000_000; // listing photos are resized to 1800 px on the longest side before upload (about 2.4 million pixels)

export async function keptShare(png, {alphaThreshold = 128} = {}) {
  try {
    const b = png instanceof Uint8Array ? png : new Uint8Array(png);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (b.length < 33 || sig.some((v, i) => b[i] !== v)) return null;
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let o = 8, width = 0, height = 0, depth = 0, colorType = -1, interlace = 0; const idat = [];
    while (o + 8 <= b.length) {
      const len = view.getUint32(o), type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
      if (type === 'IHDR') { width = view.getUint32(o + 8); height = view.getUint32(o + 12); depth = b[o + 16]; colorType = b[o + 17]; interlace = b[o + 20]; }
      else if (type === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len));
      else if (type === 'IEND') break;
      o += 12 + len;
    }
    if (!width || !height || depth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 4)) return null;
    if (width * height > MAX_PIXELS) return null; // very large: decoding could exceed the function's time budget, so do not judge it (same as before this check existed)
    const channels = colorType === 6 ? 4 : 2, stride = width * channels;
    const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    if (raw.length < (stride + 1) * height) return null;
    let prev = new Uint8Array(stride), cur = new Uint8Array(stride), kept = 0;
    for (let y = 0; y < height; y++) {
      const base = y * (stride + 1), filter = raw[base];
      for (let x = 0; x < stride; x++) {
        const rawByte = raw[base + 1 + x], a = x >= channels ? cur[x - channels] : 0, up = prev[x], c = x >= channels ? prev[x - channels] : 0;
        let v;
        if (filter === 0) v = rawByte;
        else if (filter === 1) v = rawByte + a;
        else if (filter === 2) v = rawByte + up;
        else if (filter === 3) v = rawByte + ((a + up) >> 1);
        else if (filter === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
        else return null;
        cur[x] = v & 255;
      }
      for (let x = channels - 1; x < stride; x += channels) if (cur[x] >= alphaThreshold) kept++;
      [prev, cur] = [cur, prev];
    }
    return kept / (width * height);
  } catch { return null; }
}

export const cutoutIsTooSmall = share => share !== null && share !== undefined && share < MIN_KEPT_SHARE;
