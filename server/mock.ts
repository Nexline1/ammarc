// Demo mode (no API keys): a rule-based stand-in for Claude and an echo renderer.
// It exercises the full flow; it says nothing about real image quality.
import type { Check, Pitch, Plan, RenderEvent, TurnRequest } from '../shared/types.ts';

const AR = /[؀-ۿ]/;
const has = (s: string, re: RegExp) => re.test(s.toLowerCase());

export function mockPlan(req: TurnRequest): Plan {
  const s = req.sentence;
  const ar = AR.test(s);
  const { elements, marks } = req.scene;
  const regionMarks = marks.filter((m) => m.type !== 'text' && m.type !== 'dimension');
  const say = (en: string, a: string) => (ar ? a : en);
  const base: Plan = {
    action: 'edit', region: 'whole', expand_pct: 0, change: s, items: [], preserve: [], style: 'photo',
    assumptions: [], reply: '', rule_suggestion: '', part_name: '',
  };

  if (has(s, /^(no|not|wrong)\b|^(لا|غلط|مو كذا)/)) base.rule_suggestion = say(`When I say "${s}", apply it literally.`, `لما أقول "${s}" نفّذها حرفيًا.`);

  if (has(s, /\b(make|create) (me )?(a |an )?.*\b(element|part)\b|سو(ي|ّي) لي (قطعة|عنصر)/)) {
    const name = s.replace(/.*\b(?:make|create) (?:me )?(?:a |an )?/i, '').replace(/\b(element|part)\b.*/i, '').trim() || 'part';
    return { ...base, action: 'make_part', part_name: name, change: `Create a ${name} part`, reply: say(`Making a "${name}" part for your library.`, `أسوي لك قطعة "${name}" في مكتبتك.`) };
  }

  const wants3d = has(s, /\b3d\b|three.?d|render|ثلاثي|ثري دي|3 ?دي/);
  if (!req.base || wants3d) {
    return {
      ...base, action: 'generate', region: 'whole', style: elements.length || wants3d ? '3d_render' : 'photo',
      change: wants3d ? 'Render the whole scene as a convincing 3D industrial image, keeping every object, position and proportion.' : s,
      items: elements.map((e, i) => ({ tag: `E${i + 1}`, what: e.prompt, material: 'steel', size_cm: e.sizeCm ? `${e.sizeCm[0]} × ${e.sizeCm[1]} cm` : '', position: 'as placed', orientation: e.hinge ? `hinge on the ${e.hinge}` : '' })),
      preserve: ['every existing object and its position'],
      reply: say('Demo mode: rendering the whole scene in 3D.', 'وضع التجربة: أحوّل المشهد كامل إلى 3D.'),
    };
  }

  const region = regionMarks.length && elements.length ? 'marks_and_elements' : regionMarks.length ? 'marks' : elements.length ? 'elements' : null;
  if (!region) {
    if (has(s, /\b(here|there|put|add|place)\b|هنا|حط|ضيف|أضف/)) return { ...base, action: 'reply', reply: say('Tap where it should go.', 'اضغط على المكان.') };
    return { ...base, region: 'whole', reply: say('Demo mode: applying that to the whole image.', 'وضع التجربة: أطبّقها على الصورة كاملة.') };
  }

  const door = has(s, /door|gate|باب|بوابة/);
  const doorEl = elements.find((e) => e.hinge);
  const plan: Plan = {
    ...base, region,
    expand_pct: 3,
    change: s,
    items: [
      ...elements.map((e, i) => ({ tag: `E${i + 1}`, what: e.prompt, material: 'steel', size_cm: e.sizeCm ? `${e.sizeCm[0]} × ${e.sizeCm[1]} cm` : '', position: 'exactly as placed', orientation: e.hinge ? `hinge on the ${e.hinge}` : '' })),
      ...(elements.length ? [] : [{ tag: 'M1', what: s, material: door ? 'steel' : '', size_cm: '', position: 'inside the red mark', orientation: door ? 'hinge on the left' : '' }]),
    ],
    preserve: ['surrounding equipment', 'pipes, ducts and handrails near the mark', 'floor and walls'],
    reply: say('Demo mode: editing only the marked area.', 'وضع التجربة: أعدّل المنطقة المحددة فقط.'),
  };
  if (door && !doorEl) plan.assumptions.push({ text: say('Hinge on the left', 'المفصلة يسار'), alt: say('Put the hinge on the right', 'خل المفصلة يمين') });
  return plan;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* mockRender(image: string): AsyncGenerator<RenderEvent> {
  const b64 = image.slice(image.indexOf(',') + 1);
  await wait(500); yield { type: 'partial', b64 };
  await wait(500); yield { type: 'partial', b64 };
  await wait(400); yield { type: 'image', b64 };
}

export const mockCheck = (): Check => ({ ok: true, issue: '', fix: '' });

export const mockPitch = (lang: 'en' | 'ar', history: { role: string; text: string }[]): Pitch => {
  const last = [...history].reverse().find((l) => l.role === 'user')?.text || '';
  return lang === 'ar'
    ? { title: 'مقترح تحسين في الموقع', hazard: 'الوضع الحالي يسبب خطرًا أو تأخيرًا في العمل.', consequence: 'احتمال إصابة أو توقف في الإنتاج.', solution: last || 'التعديل الموضح في الصورة.' }
    : { title: 'Proposed site improvement', hazard: 'The current setup creates a risk or slows the work.', consequence: 'Possible injury or production downtime.', solution: last || 'The change shown in the image.' };
};

export const mockTranscribe = (lang: string) => (lang === 'ar' ? 'حط باب حديد هنا' : 'put a metal door here');

export function mockPartSvg(name: string): string {
  const safe = name.replace(/[<>&"']/g, '').slice(0, 28);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120"><rect x="10" y="14" width="140" height="78" rx="10" fill="#E6E9ED" stroke="#2A2F36" stroke-width="2.5" stroke-dasharray="6 5"/><text x="80" y="58" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle" fill="#2A2F36">${safe}</text><text x="80" y="110" font-family="system-ui,sans-serif" font-size="10" text-anchor="middle" fill="#5B636E">demo part</text></svg>`;
}
