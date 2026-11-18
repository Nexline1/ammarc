// Pure layout logic for the proposal deck (unit-tested); Export.tsx turns it into slides.
import type { Pitch } from '../../shared/types.ts';

export type Pic = { url: string; w: number; h: number };
export type Idea = { id: string; name: string; pitch: Pitch | null; before: Pic; after: Pic };
export type SlideSpec =
  | { kind: 'cover'; count: number }
  | { kind: 'idea'; n: number; idea: Idea }
  | { kind: 'summary'; rows: { n: number; title: string; pitch: Pitch | null }[] };

/** One idea = just its slide. Several = cover, one slide each in the order he picked, then a summary table. */
export function deckPlan(ideas: Idea[]): SlideSpec[] {
  const slides: SlideSpec[] = ideas.map((idea, i) => ({ kind: 'idea', n: i + 1, idea }));
  if (ideas.length < 2) return slides;
  return [
    { kind: 'cover', count: ideas.length },
    ...slides,
    { kind: 'summary', rows: ideas.map((i, k) => ({ n: k + 1, title: i.pitch?.title || i.name, pitch: i.pitch })) },
  ];
}

/** Fit a picture into a box by its own aspect ratio, centred. */
export function fitBox(pic: { w: number; h: number }, bw: number, bh: number) {
  const r = pic.w / pic.h;
  const [w, h] = r > bw / bh ? [bw, bw / r] : [bh * r, bh];
  return { w, h, dx: (bw - w) / 2, dy: (bh - h) / 2 };
}
