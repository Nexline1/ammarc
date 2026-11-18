import { describe, expect, it } from 'vitest';
import { CutoutRequest, EmailRequest, Project } from '../shared/types.ts';
import { cmText, parseCm, realSize } from '../src/canvas/scale.ts';
import { alphaBounds } from '../src/canvas/raster.ts';
import { deckPlan, fitBox, type Idea } from '../src/panels/deck.ts';
import { mockEmail } from '../server/mock.ts';

describe('scale', () => {
  it.each([['90 cm', 90], ['90', 90], ['0.9 m', 90], ['900 mm', 90], ['٩٠ سم', 90], ['1,5 m', 150], ['≈ 62 cm', 62]])('parses %s', (s, cm) => expect(parseCm(s)).toBeCloseTo(cm as number));
  it.each(['', 'abc', '0', '-5 cm', '90 inches'])('rejects %s', (s) => expect(parseCm(s)).toBeNull());
  it('formats lengths readably', () => {
    expect(cmText(62.4)).toBe('62 cm');
    expect(cmText(125)).toBe('1.25 m');
  });
  it('sizes a 90 cm door from a 300 px = 90 cm reference', () => {
    const [w, h] = realSize(90, 300 / 90, 1.5, 1000);
    expect(w).toBeCloseTo(300);
    expect(h).toBeCloseTo(200);
  });
  it('keeps absurd sizes on the photo', () => {
    expect(realSize(10_000, 5, 1, 1000)[0]).toBe(950);
    expect(realSize(0.1, 5, 1, 1000)[0]).toBe(30);
  });
});

describe('proposal deck', () => {
  const pic = { url: 'data:image/png;base64,', w: 4, h: 3 };
  const idea = (id: string): Idea => ({ id, name: id, pitch: { title: id, hazard: 'h', consequence: 'c', solution: 's' }, before: pic, after: pic });
  it('one idea is just its slide', () => {
    expect(deckPlan([idea('a')]).map((s) => s.kind)).toEqual(['idea']);
  });
  it('several ideas: cover, one slide each in his order, summary', () => {
    const plan = deckPlan([idea('b'), idea('a'), idea('c')]);
    expect(plan.map((s) => s.kind)).toEqual(['cover', 'idea', 'idea', 'idea', 'summary']);
    expect(plan.filter((s) => s.kind === 'idea').map((s) => (s.kind === 'idea' ? s.idea.id : ''))).toEqual(['b', 'a', 'c']);
    const summary = plan[plan.length - 1];
    expect(summary.kind === 'summary' && summary.rows.map((r) => r.n)).toEqual([1, 2, 3]);
  });
  it('fits pictures inside their box without stretching', () => {
    const wide = fitBox({ w: 16, h: 9 }, 5.9, 3.3);
    expect(wide.w / wide.h).toBeCloseTo(16 / 9);
    expect(wide.w).toBeLessThanOrEqual(5.9);
    const tall = fitBox({ w: 3, h: 4 }, 5.9, 3.3);
    expect(tall.h).toBeCloseTo(3.3);
    expect(tall.dx).toBeGreaterThan(0);
  });
});

describe('cut-out trimming', () => {
  it('finds the visible part of a transparent image', () => {
    const w = 10, h = 8, px = new Uint8ClampedArray(w * h * 4);
    for (let y = 2; y < 5; y++) for (let x = 3; x < 7; x++) px[(y * w + x) * 4 + 3] = 255;
    expect(alphaBounds(px, w, h)).toEqual({ x0: 3, y0: 2, x1: 7, y1: 5 });
    expect(alphaBounds(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull();
  });
});

describe('saved data and new endpoints', () => {
  it('projects saved before this round still load (new fields are optional)', () => {
    const old = { id: 'p1', name: 'Door', updatedAt: 1, versions: [], current: null, scene: { elements: [], marks: [] }, messages: [] };
    expect(Project.safeParse(old).success).toBe(true);
    expect(Project.safeParse({ ...old, scene: { ...old.scene, scale: { pxPerCm: -1 } } }).success).toBe(false);
  });
  it('email and cut-out requests reject bad input', () => {
    expect(EmailRequest.safeParse({ lang: 'en', pitches: [] }).success).toBe(false);
    expect(CutoutRequest.safeParse({ image: 'data:text/html;base64,AA', size: '1024x1024' }).success).toBe(false);
    expect(CutoutRequest.safeParse({ image: 'data:image/png;base64,AA', size: 'big' }).success).toBe(false);
  });
  it('demo email covers every picked idea, in his language', () => {
    const p = { title: 'Door', hazard: 'h', consequence: 'c', solution: 'Add a steel door' };
    expect(mockEmail('en', [p, { ...p, title: 'Grating' }]).body).toMatch(/1\. Door[\s\S]*2\. Grating/);
    expect(mockEmail('ar', [p]).body).toMatch(/[؀-ۿ]/);
  });
});
