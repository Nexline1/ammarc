import { describe, expect, it } from 'vitest';
import type { Scene } from '../shared/types.ts';
import { apiSize, buildMasks, dilate, pasteBack, regionParts } from '../src/canvas/raster.ts';

describe('regionParts', () => {
  const scene: Scene = {
    elements: [{ uid: 'e', kind: 'catalog', ref: 'x', name: 'Door', prompt: 'door', x: 1, y: 1, w: 1, h: 1, rotation: 0, flipX: false, hinge: null, sizeCm: null, url: '' }],
    marks: [{ uid: 'm', type: 'pen', points: [[0, 0], [5, 5]] }, { uid: 'd', type: 'dimension', points: [[0, 0], [9, 0]], text: '90 cm' }],
  };
  it('makes everything he marked or dropped editable, whatever subset Claude named', () => {
    for (const region of ['marks', 'elements', 'marks_and_elements'] as const) {
      const r = regionParts(scene, { region });
      expect(r.elements.map((e) => e.uid)).toEqual(['e']);
      expect(r.marks.map((m) => m.uid)).toEqual(['m']); // dimensions and notes never define a region
    }
  });
  it('a whole-image change has no region', () => {
    expect(regionParts(scene, { region: 'whole' })).toEqual({ elements: [], marks: [] });
  });
});

const W = 64, H = 48;
const rgba = (fill: (i: number) => number) => { const a = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < a.length; i++) a[i] = (i + 1) % 4 === 0 ? 255 : fill(i); return a; };
const square = (x0: number, y0: number, x1: number, y1: number) => {
  const m = new Float32Array(W * H);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1;
  return m;
};

describe('apiSize', () => {
  it.each([[1536, 1152], [1536, 1536], [1152, 1536], [1536, 864], [640, 480], [4000, 3000], [3000, 900], [500, 2000]])('%i×%i fits the API rules', (w, h) => {
    const [A, B] = apiSize(w, h);
    expect(A % 16).toBe(0);
    expect(B % 16).toBe(0);
    expect(A * B).toBeGreaterThanOrEqual(655_360);
    expect(A * B).toBeLessThanOrEqual(8_294_400);
    expect(Math.max(A, B)).toBeLessThan(3840);
    expect(Math.max(A, B) / Math.min(A, B)).toBeLessThanOrEqual(3);
  });
  it('keeps normal sizes unchanged', () => expect(apiSize(1536, 1152)).toEqual([1536, 1152]));
});

describe('dilate', () => {
  it('grows a single pixel into a (2r+1) square', () => {
    const m = new Float32Array(W * H);
    m[20 * W + 30] = 1;
    const d = dilate(m, W, H, 2);
    expect(d.reduce((a, b) => a + b, 0)).toBe(25);
    expect(d[18 * W + 28]).toBe(1);
    expect(d[17 * W + 30]).toBe(0);
  });
});

describe('pasteBack', () => {
  const base = rgba((i) => (i * 7) % 251);
  const result = rgba((i) => 255 - ((i * 13) % 251));
  const masks = buildMasks(square(24, 18, 36, 28), W, H, 2, 3);

  it('leaves every pixel the model was not allowed to paint byte-identical', () => {
    const out = pasteBack(base, result, masks.soft);
    let checked = 0;
    for (let p = 0; p < W * H; p++) {
      if (masks.paintable[p]) continue;
      for (let c = 0; c < 4; c++) expect(out[p * 4 + c]).toBe(base[p * 4 + c]);
      checked++;
    }
    expect(checked).toBeGreaterThan(W * H / 2);
  });

  it('uses the result fully inside the marked region', () => {
    const out = pasteBack(base, result, masks.soft);
    const p = 22 * W + 30;
    for (let c = 0; c < 3; c++) expect(out[p * 4 + c]).toBe(result[p * 4 + c]);
  });

  it('cancels a global colour shift from the model using the ring around the region', () => {
    const shifted = new Uint8ClampedArray(base.length);
    for (let i = 0; i < base.length; i++) shifted[i] = (i + 1) % 4 === 0 ? 255 : Math.min(255, base[i] + 12);
    const flat = rgba(() => 100), flatShifted = rgba(() => 112);
    const out = pasteBack(flat, flatShifted, masks.soft, masks.ring);
    const p = 22 * W + 30;
    for (let c = 0; c < 3; c++) expect(out[p * 4 + c]).toBe(100);
    expect(masks.ring.some((v) => v === 1)).toBe(true);
  });

  it('soft mask is 1 inside, 0 far away, and never outside paintable', () => {
    expect(masks.soft[22 * W + 30]).toBe(1);
    expect(masks.soft[2 * W + 2]).toBe(0);
    for (let p = 0; p < W * H; p++) if (masks.soft[p] > 0) expect(masks.paintable[p]).toBe(1);
  });
});
