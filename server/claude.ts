// Claude = the brain. It reads one sentence + the board and returns a Plan;
// it also checks results and drafts pitch slides. It never writes the image prompt itself.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { Check, Pitch, Plan, type Memory, type Scene, type TurnRequest } from '../shared/types.ts';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const CHECK_MODEL = process.env.CHECK_MODEL || 'claude-haiku-5-5';
const EFFORT = (process.env.CLAUDE_EFFORT || 'medium') as 'low' | 'medium' | 'high';

let client: Anthropic | null = null;
const api = () => (client ??= new Anthropic());

export const SYSTEM = `You are the planning brain of Ammarc, a studio where an engineer at an aluminium smelter turns plant-improvement ideas into images he pitches to his boss. You never draw. You read his one sentence plus the board and return a precise plan that an image model executes. Separate code places his dropped elements exactly, draws dimensions, and pastes the original pixels back outside the edited region, so your job is to be exact about WHAT changes and WHAT must stay.

How he works
- He speaks one sentence, in English, Arabic (Gulf dialect) or both mixed. He does not want back-and-forth. Act on the sentence.
- He marks the image in red: a circle or scribble means "here"; a single dot means "here"; an arrow points at a thing or a direction; a dimension line carries an exact size; a text note is an extra instruction.
- Dropped elements (E1, E2…) are line-drawing placeholders he placed exactly where the real object goes. Their position, size, rotation and hinge side are deliberate: never move them and never change their hinge side.
- Follow him literally. Change only what he asked. Never remove, redesign or "improve" anything he did not mention. "Remove the marked item" means only that item.
- When he corrects you ("no", "not that", "لا", "غلط", "مو كذا"), the correction is authoritative: fix exactly that, and put a short general rule in rule_suggestion if it would prevent the same mistake next time.

What you receive
- Image 1: the current image. Image 2: the same image with his marks, dimension lines, notes and numbered tags E#/M#. (Neither image is sent when the board is empty.)
- SCENE: image size in pixels, then elements (tag, name, description, centre and size as % of the image, rotation, hinge side, size_cm) and marks (tag, type, position as %, text).
- Recent conversation, then his sentence.
- His rules, spec book and glossary (below). A spec applies only when the request concerns that same component.

Deciding the plan
- action:
  - "edit": something is added, changed, removed or moved in the current image.
  - "generate": the board is empty, or he wants a fresh whole-scene view or render ("make it 3D", "show it as a render", a blank board with dropped elements).
  - "make_part": he asks for a new library element/part ("make me a flue-end obturator element"). Set part_name.
  - "reply": nothing should be rendered: a question, or a placement request with no location (no marks, no elements, and his words don't pin the spot). For a missing location, reply only: "Tap where it should go." / "اضغط على المكان." This is the ONLY clarifying question allowed. For any other ambiguity, choose the most likely option, act, and list the guess in assumptions with its one-tap alternative (hinge side when no door element was dropped, opening direction, material, which of two similar objects).
- region: "marks" when his marks locate the change, "elements" when dropped elements do, "marks_and_elements" when both, "whole" for global changes (3D, style, lighting, whole-scene generate). Anything other than "whole" makes every red mark and dropped element editable and keeps the rest of the image pixel-identical. For "move X by 20 cm" the region must cover the old and new positions: use expand_pct.
- expand_pct: extra margin the change needs beyond his marks and elements, as a percentage of the image's shorter side (0–25), e.g. a door bigger than his circle or a handrail running along a platform. 0 when the marks already cover it.
- change: one plain, precise sentence. Copy his numbers and identifiers verbatim (e.g. "MEC0-1721-TT2", "lower by 20 cm").
- items: one per object that appears or changes. Use the E#/M# tag it belongs to, else "new". size_cm only from his words, a dimension mark or the element's size_cm; never invent dimensions. For doors, gates and hinged panels, orientation must state the hinge side (from the element when present).
- preserve: 3–8 specific visible things next to the region that a careless edit would disturb (e.g. "yellow handrail on the left", "gas hose under the burner ramp", "grating on the platform"). Look at the image.
- style: "photo" when editing a real photo; "3d_render" when he says 3D or render, or the base is a blank board with elements; "drawing" when he asks for a drawing or diagram. If his rules say no colour for a proposal, honour it.
- reply: 1–2 short sentences in HIS language (Arabic if he wrote Arabic) saying what you are doing in his terms. No pleasantries, no process talk.
- Never claim safety compliance, load ratings or engineering approval.`;

export function memoryText(m: Memory): string {
  const rules = m.rules.map((r) => `- ${r.text}`).join('\n');
  const specs = m.specs.map((s) => `- ${s.part}: ${s.spec}`).join('\n');
  const gloss = m.glossary.map((g) => `- "${g.says}" means ${g.means}`).join('\n');
  return `\n\nHis rules\n${rules || '- (none yet)'}\n\nSpec book (only for the same component)\n${specs || '- (none)'}\n\nGlossary\n${gloss || '- (none)'}`;
}

const pct = (v: number, of: number) => `${Math.round((v / of) * 1000) / 10}%`;

export function describeScene(scene: Scene, w: number, h: number): string {
  const lines = [`Image: ${w}×${h}px`];
  scene.elements.forEach((e, i) => {
    lines.push(`E${i + 1}: ${e.name} (${e.prompt}); centre ${pct(e.x, w)} across, ${pct(e.y, h)} down; size ${pct(e.w, w)}×${pct(e.h, h)}; rotation ${Math.round(e.rotation)}°` +
      (e.hinge ? `; hinge ${e.hinge}` : '') + (e.sizeCm ? `; size ${e.sizeCm[0]}×${e.sizeCm[1]} cm` : ''));
  });
  scene.marks.forEach((m, i) => {
    const kind = { pen: 'red circle/scribble', point: 'red dot', arrow: 'red arrow pointing from→to', dimension: 'dimension line', text: 'note' }[m.type];
    let where: string;
    if (m.type === 'pen') {
      const xs = m.points.map((p) => p[0]), ys = m.points.map((p) => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      where = `around centre ${pct((x0 + x1) / 2, w)} across, ${pct((y0 + y1) / 2, h)} down; size ${pct(x1 - x0, w)}×${pct(y1 - y0, h)}`;
    } else {
      const [a, b] = [m.points[0] ?? [0, 0], m.points[1]];
      where = `at ${pct(a[0], w)} across, ${pct(a[1], h)} down` + (b ? ` to ${pct(b[0], w)}, ${pct(b[1], h)}` : '');
    }
    lines.push(`M${i + 1}: ${kind} ${where}${m.text ? ` — "${m.text}"` : ''}`);
  });
  if (!scene.elements.length && !scene.marks.length) lines.push('(no elements or marks)');
  return lines.join('\n');
}

type Img = Anthropic.Beta.BetaImageBlockParam;
function imageBlock(dataUrl: string): Img {
  const [head, data] = dataUrl.split(',', 2);
  const media = head.slice(5, head.indexOf(';')) as 'image/jpeg' | 'image/png' | 'image/webp';
  return { type: 'image', source: { type: 'base64', media_type: media, data } };
}

// Opus/Sonnet 5.5 get server-side refusal fallback; Haiku has none.
const fallback = (model: string) => (/haiku/.test(model) ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const });

async function ask<T extends z.ZodType>(model: string, schema: T, system: string, content: Anthropic.Beta.BetaContentBlockParam[], effort = EFFORT): Promise<z.infer<T>> {
  const msg = await api().beta.messages.parse({
    model,
    max_tokens: 16000,
    ...fallback(model),
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: 'user', content }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  if (!msg.parsed_output) throw new Error(`Claude returned no plan (stop: ${msg.stop_reason}).`);
  return msg.parsed_output as z.infer<T>;
}

export async function planTurn(req: TurnRequest, memory: Memory): Promise<Plan> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.base) content.push(imageBlock(req.base));
  if (req.overlay) content.push(imageBlock(req.overlay));
  const history = req.history.map((l) => `${l.role === 'user' ? 'Him' : 'You'}: ${l.text}`).join('\n');
  content.push({
    type: 'text',
    text: `SCENE\n${describeScene(req.scene, req.w, req.h)}\n\nRecent conversation\n${history || '(start)'}\n\nHis sentence (${req.lang === 'ar' ? 'Arabic' : 'English'}): ${req.sentence}`,
  });
  return Plan.parse(await ask(MODEL, Plan, SYSTEM + memoryText(memory), content));
}

export async function checkResult(sentence: string, plan: Plan, before: string, after: string, lang: 'en' | 'ar'): Promise<Check> {
  const system = `You verify image edits for an engineer. Compare BEFORE (image 1) and AFTER (image 2) against his request and the plan. ok=true when the requested change is clearly present and nothing important outside the request disappeared or moved. Be strict about missing objects, wrong counts, wrong hinge side and removed neighbouring items; ignore small texture, noise or lighting differences. When not ok, write issue (one sentence) and fix (one sentence he could send as the next request), both in ${lang === 'ar' ? 'Arabic' : 'English'}.`;
  return Check.parse(await ask(CHECK_MODEL, Check, system, [
    imageBlock(before), imageBlock(after),
    { type: 'text', text: `Request: ${sentence}\nPlan: ${plan.change}\nHinge/orientation: ${plan.items.map((i) => i.orientation).filter(Boolean).join('; ') || 'n/a'}` },
  ], 'low'));
}

export async function draftPitch(lang: 'en' | 'ar', history: { role: string; text: string }[], before: string | null, after: string | null): Promise<Pitch> {
  const system = `You write one PowerPoint pitch slide for an engineer at an aluminium smelter proposing a plant improvement to his boss. Fields: title (max 8 words), hazard (the source of the risk or inefficiency), consequence (what can happen), solution (the proposed change shown in the image). Each field max 22 words, concrete, plain, in ${lang === 'ar' ? 'Arabic' : 'English'}. Do not invent figures, standards or approvals.`;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (before) content.push(imageBlock(before));
  if (after) content.push(imageBlock(after));
  content.push({ type: 'text', text: `Conversation:\n${history.map((l) => `${l.role}: ${l.text}`).join('\n')}` });
  return Pitch.parse(await ask(MODEL, Pitch, system, content, 'low'));
}
