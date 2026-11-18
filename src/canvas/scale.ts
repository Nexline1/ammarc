// Real-world scale from one known dimension (his CAD habit: "door 90×60", "lower 20 cm").
// Approximate by nature: a photo has perspective, so it holds near the plane he measured on.

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** "90 cm", "90", "0.9 m", "900 mm", "٩٠ سم", "1,5 m" -> centimetres, or null. A bare number means cm. */
export function parseCm(text: string): number | null {
  const t = text.trim().toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/٫|,/g, '.')
    .replace(/^≈\s*/, '');
  const m = /^(\d+(?:\.\d+)?)\s*(mm|cm|m|مم|سم|م)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  const unit = m[2] ?? 'cm';
  const cm = unit === 'mm' || unit === 'مم' ? n / 10 : unit === 'm' || unit === 'م' ? n * 100 : n;
  return cm;
}

export const lengthPx = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Readable length: 62 cm, 1.25 m. */
export function cmText(cm: number): string {
  return cm >= 100 ? `${Number((cm / 100).toFixed(2))} m` : `${Math.round(cm)} cm`;
}

/** Pixel size for an element of known real width, keeping the drawing's own aspect. */
export function realSize(widthCm: number, pxPerCm: number, aspect: number, shortSide: number): [number, number] {
  const w = Math.min(shortSide * 0.95, Math.max(shortSide * 0.03, widthCm * pxPerCm));
  return [w, w / aspect];
}
