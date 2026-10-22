// One sentence -> Claude's plan -> masked render with paste-back -> new version -> background check.
import type { Check, Lang, Message, Plan, Scene, Version } from '../shared/types.ts';
import { api, fileUrl, renderStream, upload } from './api.ts';
import { boardReady, startBlank } from './actions.ts';
import { loadCached } from './canvas/Board.tsx';
import { apiMask, apiSize, buildMasks, canvas, draw, forClaude, loadImage, pasteBack, pixels, regionMask, type Masks } from './canvas/raster.ts';
import { tr } from './i18n.ts';
import { addMessage, edit, get, set, uid, type Part } from './store.ts';

const AR = /[؀-ۿ]/;
const say = (k: Parameters<typeof tr>[1]) => tr(get().lang, k);

/** Everything a turn writes goes to the project it started in; if he switched away, it is dropped, never misfiled. */
function forProject(pid: string) {
  const here = () => get().project?.id === pid;
  return {
    here,
    message: (m: Omit<Message, 'id'>) => { if (here()) addMessage(m); },
  };
}

export async function runTurn(sentence: string) {
  sentence = sentence.trim();
  if (!sentence || !get().project || get().busy) return;
  const lang: Lang = AR.test(sentence) ? 'ar' : 'en';
  set({ busy: { stage: 'thinking', text: say('thinking') } }); // claim the turn now, so a double Enter can't send twice
  const pid = get().project!.id;
  const out = forProject(pid);
  addMessage({ role: 'user', text: sentence });
  if (/^(Untitled idea|New idea|فكرة جديدة)$/.test(get().project!.name)) edit(() => ({ name: sentence.slice(0, 48) }), false);
  set({ draft: '', hint: null, awaiting: null, selected: null, pending: null });
  try {
    if (!get().project!.current) await startBlank('1:1');
    const board = await boardReady();
    const { w, h } = board.size()!;
    const project = get().project!;
    const scene: Scene = project.scene; // the exact scene Claude plans on is the scene that gets rendered
    const version = project.versions.find((v) => v.id === project.current)!;
    const empty = version.note === 'blank' && !scene.elements.length && !scene.marks.length;

    set({ busy: { stage: 'thinking', text: say('thinking') } });
    const overlay = board.exportCanvas({ marks: 'all', tags: true })!;
    const history = project.messages.slice(-9, -1).map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
    const { plan } = await api.post<{ plan: Plan }>('/api/turn', {
      sentence, lang, w, h, scene, history,
      base: empty ? null : forClaude(board.base()!),
      overlay: empty ? null : forClaude(overlay),
    });
    if (!out.here()) return;

    out.message({
      role: 'agent',
      text: plan.reply || '…',
      chips: plan.assumptions.length ? plan.assumptions.map((a) => ({ label: a.alt, send: a.alt })) : undefined,
      rule: plan.rule_suggestion || undefined,
    });

    if (plan.action === 'reply') {
      // The one allowed question: where? Switch to marking; his next tap re-sends the sentence.
      if (!locates(scene)) askWhere(sentence);
      return;
    }
    if (plan.action === 'make_part') {
      set({ busy: { stage: 'rendering', text: say('rendering') } });
      const part = await api.post<Part>('/api/part', { plan });
      set((s) => ({ parts: [part, ...s.parts.filter((p) => p.file !== part.file)] }));
      out.message({ role: 'agent', text: say('partMade') });
      return;
    }
    await render(sentence, plan, lang, scene, out);
  } catch (e) {
    out.message({ role: 'agent', text: `${say('error')}: ${(e as Error).message}` });
  } finally {
    set({ busy: null, preview: null });
  }
}

const locates = (s: Scene) => s.elements.length > 0 || s.marks.some((m) => m.type === 'pen' || m.type === 'point' || m.type === 'arrow');
function askWhere(sentence: string) {
  set({ tool: 'pen', hint: say('tapWhere'), awaiting: sentence });
}

async function render(sentence: string, plan: Plan, lang: Lang, scene: Scene, out: ReturnType<typeof forProject>) {
  const board = await boardReady();
  const { w, h } = board.size()!;
  const parent = get().project!.current;

  let masks: Masks | null = null, mask: string | null = null;
  if (plan.action === 'edit' && plan.region !== 'whole') {
    const region = regionMask(scene, plan, w, h);
    if (!region) {
      // An edit with nothing marked would regenerate the whole picture: ask for the spot instead.
      out.message({ role: 'agent', text: say('tapWhere') });
      askWhere(sentence);
      return;
    }
    const short = Math.min(w, h);
    const expand = Math.round((Math.min(25, Math.max(0, plan.expand_pct)) / 100) * short);
    masks = buildMasks(region, w, h, expand, Math.max(4, Math.round(short * 0.012)));
  }

  set({ busy: { stage: 'rendering', text: say('rendering') } });
  const composite = board.exportCanvas({ marks: 'none' })!; // photo + dropped elements, no red marks
  const baseC = draw(board.base()!, w, h);
  const basePx = pixels(baseC);
  const [W, H] = apiSize(w, h);
  if (masks) mask = apiMask(masks.paintable, w, h, W, H);

  const refs = await Promise.all(scene.elements.filter((e) => e.kind === 'part').slice(0, 8).map(async (e) => {
    const img = await loadCached(e.url);
    const s = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    return draw(img, Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s)).toDataURL('image/png');
  }));

  let final: HTMLCanvasElement | null = null;
  for await (const ev of renderStream({ plan, scene, image: draw(composite, W, H).toDataURL('image/png'), mask, refs, size: `${W}x${H}` })) {
    if (ev.type === 'error') throw new Error(ev.message);
    const result = draw(await loadImage(`data:image/png;base64,${ev.b64}`), w, h);
    let img = result;
    if (masks) {
      img = canvas(w, h);
      img.getContext('2d')!.putImageData(new ImageData(pasteBack(basePx, pixels(result), masks.soft, masks.ring), w, h), 0, 0);
    }
    if (ev.type === 'partial') { if (out.here()) set({ preview: img.toDataURL('image/jpeg', 0.9) }); }
    else final = img;
  }
  if (!final) throw new Error('No image came back.');
  if (!out.here()) return;

  const finalUrl = final.toDataURL('image/png');
  set({ preview: finalUrl, busy: { stage: 'saving', text: say('saving') } });
  const file = await upload(finalUrl);
  await loadCached(fileUrl(file)).catch(() => undefined); // swap without a flash
  if (!out.here()) return;
  const v: Version = { id: uid(), file, note: sentence.slice(0, 140), parent, at: Date.now() };
  // What was rendered is now part of the picture; dimensions, notes and anything not in the plan's scene stay.
  const used = new Set([...scene.elements.map((e) => e.uid), ...scene.marks.filter((m) => m.type !== 'dimension' && m.type !== 'text').map((m) => m.uid)]);
  edit((p) => ({ versions: [...p.versions, v], current: v.id, scene: { elements: p.scene.elements.filter((e) => !used.has(e.uid)), marks: p.scene.marks.filter((m) => !used.has(m.uid)) } }));
  set({ tool: 'select' }); // the marks are spent; back to moving things, not drawing
  void check(sentence, plan, forClaude(baseC), forClaude(final), lang, out);
}

async function check(sentence: string, plan: Plan, before: string, after: string, lang: Lang, out: ReturnType<typeof forProject>) {
  try {
    const c = await api.post<Check>('/api/check', { sentence, plan, before, after, lang });
    if (!c.ok && c.issue) out.message({ role: 'agent', text: c.issue, fix: c.fix || undefined });
  } catch { /* best effort: never block him on the check */ }
}
