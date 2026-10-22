// The contract between the canvas, Claude and the image renderer.
// Everything that crosses the server boundary is validated with these schemas.
import { z } from 'zod';

export const BRAND = { name: 'Ammarc', tagline: 'Say it. See it built.', taglineAr: 'قلها… وشوفها مبنية.' };

export const Lang = z.enum(['en', 'ar']);
export type Lang = z.infer<typeof Lang>;

// ---------- Scene (what's on the board, in base-image pixels) ----------
export const SceneElement = z.object({
  uid: z.string(),
  kind: z.enum(['catalog', 'part']), // catalog = drawn library item, part = cut from his own photo / generated
  ref: z.string(), // catalog id or part file id
  name: z.string(),
  prompt: z.string(), // physical description for the image model
  x: z.number(), y: z.number(), // centre
  w: z.number(), h: z.number(),
  rotation: z.number(), // degrees
  flipX: z.boolean(),
  hinge: z.enum(['left', 'right']).nullable(),
  sizeCm: z.tuple([z.number(), z.number()]).nullable(),
  url: z.string(),
});
export type SceneElement = z.infer<typeof SceneElement>;

const Pt = z.tuple([z.number(), z.number()]);
export const Mark = z.object({
  uid: z.string(),
  type: z.enum(['pen', 'point', 'arrow', 'dimension', 'text']),
  points: z.array(Pt), // pen: path; point: [p]; arrow/dimension: [from, to]; text: [anchor]
  text: z.string().optional(), // dimension value ("90 cm") or note text
});
export type Mark = z.infer<typeof Mark>;

export const Scene = z.object({ elements: z.array(SceneElement), marks: z.array(Mark) });
export type Scene = z.infer<typeof Scene>;

// ---------- Plan (Claude's structured reading of one sentence) ----------
export const PlanItem = z.object({
  tag: z.string().describe('E1/E2… for a dropped element, M1… for a mark, or "new"'),
  what: z.string(),
  material: z.string(),
  size_cm: z.string().describe('only if he gave it or the element carries it, else ""'),
  position: z.string(),
  orientation: z.string().describe('hinge side, opening direction, facing; "" if not relevant'),
});

export const Plan = z.object({
  action: z.enum(['edit', 'generate', 'reply', 'make_part']),
  region: z.enum(['marks', 'elements', 'marks_and_elements', 'whole']),
  expand_pct: z.number().describe('extra margin the change needs around his marks/elements, as % of the image\'s shorter side (0–25); e.g. a door wider than the circle. 0 if none'),
  change: z.string().describe('one sentence: exactly what changes'),
  items: z.array(PlanItem),
  preserve: z.array(z.string()).describe('visible things near the region that must stay exactly as they are'),
  style: z.enum(['photo', '3d_render', 'drawing']),
  assumptions: z.array(z.object({ text: z.string(), alt: z.string() })).describe('each guess you made, with the one-tap alternative'),
  reply: z.string().describe('1–2 short sentences to him, in his language'),
  rule_suggestion: z.string().describe('a reusable rule when he corrected a previous result, else ""'),
  part_name: z.string().describe('for make_part: the part to create, else ""'),
});
export type Plan = z.infer<typeof Plan>;

export const Check = z.object({
  ok: z.boolean(),
  issue: z.string().describe('what is wrong, in his language; "" when ok'),
  fix: z.string().describe('a one-sentence correction to send as the next request; "" when ok'),
});
export type Check = z.infer<typeof Check>;

export const Pitch = z.object({ title: z.string(), hazard: z.string(), consequence: z.string(), solution: z.string() });
export type Pitch = z.infer<typeof Pitch>;

// ---------- Requests ----------
const DataUrl = z.string().startsWith('data:image/').max(30_000_000);
export const ChatLine = z.object({ role: z.enum(['user', 'agent']), text: z.string().max(4000) });

export const TurnRequest = z.object({
  sentence: z.string().min(1).max(2000),
  lang: Lang,
  base: DataUrl.nullable(), // current version (null = empty board)
  overlay: DataUrl.nullable(), // base + elements + red marks + numbered tags
  w: z.number().int().positive(), // base image size in px (scene coordinates)
  h: z.number().int().positive(),
  scene: Scene,
  history: z.array(ChatLine).max(12),
});
export type TurnRequest = z.infer<typeof TurnRequest>;

export const RenderRequest = z.object({
  plan: Plan,
  scene: Scene,
  image: DataUrl, // flattened composite at API size
  mask: DataUrl.nullable(), // transparent = editable
  refs: z.array(DataUrl).max(8),
  size: z.string().regex(/^\d+x\d+$/),
});
export type RenderRequest = z.infer<typeof RenderRequest>;

export const CheckRequest = z.object({ sentence: z.string().max(2000), plan: Plan, before: DataUrl, after: DataUrl, lang: Lang });
export const PitchRequest = z.object({ lang: Lang, history: z.array(ChatLine).max(20), before: DataUrl.nullable(), after: DataUrl.nullable() });

// ---------- Memory (visible, editable) ----------
export const Memory = z.object({
  rules: z.array(z.object({ id: z.string(), text: z.string().max(500) })),
  specs: z.array(z.object({ id: z.string(), part: z.string(), spec: z.string() })),
  glossary: z.array(z.object({ id: z.string(), says: z.string(), means: z.string() })),
});
export type Memory = z.infer<typeof Memory>;

// ---------- Projects ----------
export const Version = z.object({ id: z.string(), file: z.string(), note: z.string(), parent: z.string().nullable(), at: z.number() });
export type Version = z.infer<typeof Version>;
export const Message = z.object({
  id: z.string(),
  role: z.enum(['user', 'agent']),
  text: z.string(),
  chips: z.array(z.object({ label: z.string(), send: z.string() })).optional(),
  rule: z.string().optional(),
  fix: z.string().optional(),
});
export type Message = z.infer<typeof Message>;
export const Project = z.object({
  id: z.string(),
  name: z.string().max(120),
  updatedAt: z.number(),
  versions: z.array(Version),
  current: z.string().nullable(),
  scene: Scene,
  messages: z.array(Message),
});
export type Project = z.infer<typeof Project>;

// Stream events from /api/render
export type RenderEvent =
  | { type: 'partial'; b64: string }
  | { type: 'image'; b64: string }
  | { type: 'error'; message: string };
