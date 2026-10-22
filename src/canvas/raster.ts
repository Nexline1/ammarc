// Pixel work for the "change only what I marked" guarantee.
// The pure functions (top half) are unit-tested; the DOM helpers (bottom half) feed them.
import type { Mark, Plan, Scene } from '../../shared/types.ts';

// ---------- pure ----------

/** Size the image API accepts: edges multiple of 16, 655,360 to 8,294,400 px, edge < 3840, ratio <= 3:1. */
export function apiSize(w: number, h: number): [number, number] {
  const MIN = 655_360, MAX = 8_294_400, EDGE = 3824;
  let s = 1;
  if (w * h < MIN) s = Math.sqrt(MIN / (w * h));
  if (w * h * s * s > MAX) s = Math.sqrt(MAX / (w * h));
  s = Math.min(s, EDGE / Math.max(w, h));
  let W = Math.max(16, Math.round((w * s) / 16) * 16), H = Math.max(16, Math.round((h * s) / 16) * 16);
  if (W > 3 * H) W = 3 * H;
  if (H > 3 * W) H = 3 * W;
  while (W * H > MAX || Math.max(W, H) > EDGE) { if (W >= H) W -= 16; else H -= 16; }
  while (W * H < MIN) { if (W <= H) W += 16; else H += 16; }
  return [W, H];
}

/** Separable box sum/blur with zero padding. mean=false returns raw window sums. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number, mean = true): Float32Array {
  if (r <= 0) return src.slice();
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) acc += src[row + x];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc;
      const add = x + r + 1, sub = x - r;
      if (add < w) acc += src[row + add];
      if (sub >= 0) acc -= src[row + sub];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) acc += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc;
      const add = y + r + 1, sub = y - r;
      if (add < h) acc += tmp[add * w + x];
      if (sub >= 0) acc -= tmp[sub * w + x];
    }
  }
  if (mean) { const n = (2 * r + 1) ** 2; for (let i = 0; i < out.length; i++) out[i] /= n; }
  return out;
}

/** Square dilation of a 0/1 mask by r px. */
export function dilate(mask: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return mask.slice();
  const sum = boxBlur(mask, w, h, Math.round(r), false);
  for (let i = 0; i < sum.length; i++) sum[i] = sum[i] > 0.5 ? 1 : 0;
  return sum;
}

export type Masks = { soft: Float32Array; paintable: Float32Array; ring: Float32Array };

/**
 * region -> soft (1 inside region+expand, fades to 0 over 2*feather),
 * paintable (where soft > 0: what the model may change), ring (just outside it, for colour matching).
 */
export function buildMasks(region: Float32Array, w: number, h: number, expand: number, feather: number): Masks {
  const editable = dilate(region, w, h, expand);
  const outer = dilate(editable, w, h, feather);
  const soft = boxBlur(outer, w, h, feather);
  for (let i = 0; i < soft.length; i++) {
    const t = soft[i] < 1 / 1024 ? 0 : Math.min(1, soft[i]);
    soft[i] = t * t * (3 - 2 * t); // smoothstep
  }
  const paintable = dilate(editable, w, h, 2 * feather);
  const band = dilate(paintable, w, h, feather);
  const ring = new Float32Array(band.length);
  for (let i = 0; i < band.length; i++) ring[i] = band[i] && !paintable[i] && !soft[i] ? 1 : 0;
  return { soft, paintable, ring };
}

/** Composite the model's result into the original. Where soft = 0 the output is the original, byte for byte. */
export function pasteBack(base: Uint8ClampedArray, result: Uint8ClampedArray, soft: Float32Array, ring?: Float32Array): Uint8ClampedArray<ArrayBuffer> {
  const off = [0, 0, 0];
  if (ring) {
    let n = 0;
    for (let p = 0, i = 0; p < ring.length; p++, i += 4) {
      if (!ring[p]) continue;
      n++;
      for (let c = 0; c < 3; c++) off[c] += base[i + c] - result[i + c];
    }
    if (n) for (let c = 0; c < 3; c++) off[c] /= n;
  }
  const out = new Uint8ClampedArray(base.length);
  for (let p = 0, i = 0; p < soft.length; p++, i += 4) {
    const m = soft[p];
    if (m === 0) { out[i] = base[i]; out[i + 1] = base[i + 1]; out[i + 2] = base[i + 2]; out[i + 3] = base[i + 3]; continue; }
    for (let c = 0; c < 3; c++) out[i + c] = base[i + c] + (result[i + c] + off[c] - base[i + c]) * m;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Which scene items define the editable region. Unless the change is whole-image, everything he marked
 * or dropped is editable: he put it there for a reason, and Claude naming only part of it must never
 * leave a marked spot frozen (or, worse, leave no mask at all).
 */
export function regionParts(scene: Scene, plan: Pick<Plan, 'region'>) {
  if (plan.region === 'whole') return { elements: [], marks: [] };
  return { elements: scene.elements, marks: scene.marks.filter((m) => m.type === 'pen' || m.type === 'point' || m.type === 'arrow') };
}

// ---------- DOM ----------

export const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not load image'));
    img.src = src;
  });
}

export function draw(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

export const pixels = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;

/** Downscaled copy for Claude (vision doesn't need full resolution). */
export function forClaude(src: HTMLCanvasElement | HTMLImageElement, max = 1024): string {
  const w = src.width, h = src.height, s = Math.min(1, max / Math.max(w, h));
  return draw(src, Math.round(w * s), Math.round(h * s)).toDataURL('image/jpeg', 0.85);
}

/** Upload normalisation: honour EXIF rotation, cap at 1536 px, re-encode (drops EXIF/GPS). */
export async function normalizeFile(file: Blob): Promise<{ dataUrl: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, 1536 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = draw(bmp, w, h);
  bmp.close();
  return { dataUrl: c.toDataURL('image/png'), w, h };
}

export const ASPECTS = { '1:1': [1536, 1536], '3:4': [1152, 1536], '4:3': [1536, 1152], '16:9': [1536, 864] } as const;
export type Aspect = keyof typeof ASPECTS;

export function blankBoard(aspect: Aspect): string {
  const [w, h] = ASPECTS[aspect];
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return c.toDataURL('image/png');
}

function tracePen(ctx: CanvasRenderingContext2D, m: Mark) {
  ctx.beginPath();
  m.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}

/** Rasterise the plan's region at base resolution into a 0/1 mask. Returns null when nothing locates the change. */
export function regionMask(scene: Scene, plan: Pick<Plan, 'region'>, w: number, h: number): Float32Array | null {
  const { elements, marks } = regionParts(scene, plan);
  if (!elements.length && !marks.length) return null;
  const c = canvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.lineJoin = ctx.lineCap = 'round';
  const short = Math.min(w, h);
  for (const e of elements) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate((e.rotation * Math.PI) / 180);
    ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
    ctx.restore();
  }
  for (const m of marks) {
    if (m.type === 'pen') {
      tracePen(ctx, m);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = Math.max(16, short * 0.02);
      tracePen(ctx, m);
      ctx.stroke();
    } else {
      const [x, y] = m.points[m.points.length - 1]; // a dot, or the tip of an arrow
      ctx.beginPath();
      ctx.arc(x, y, short * (m.type === 'point' ? 0.05 : 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let p = 0; p < out.length; p++) out[p] = data[p * 4 + 3] > 0 ? 1 : 0;
  return out;
}

/** API mask: transparent where the model may paint, opaque elsewhere, scaled to the API size. */
export function apiMask(paintable: Float32Array, w: number, h: number, W: number, H: number): string {
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let p = 0; p < paintable.length; p++) img.data[p * 4 + 3] = paintable[p] ? 0 : 255;
  ctx.putImageData(img, 0, 0);
  const out = canvas(W, H);
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = false;
  o.drawImage(c, 0, 0, W, H);
  return out.toDataURL('image/png');
}
