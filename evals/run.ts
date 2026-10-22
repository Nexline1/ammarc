// Planner evals. Default (mock): checks the contract end to end without spending anything.
// --live: real Claude plans for every case, with a hard spend cap (default $5, --cap=N).
//   Images: put evals/images/<case-id>.jpg|png to test on his real photos; otherwise a plain board is used.
import '../server/env.ts';
import fs from 'node:fs';
import path from 'node:path';
import { Plan, type Mark, type Scene, type SceneElement, type TurnRequest } from '../shared/types.ts';
import { compilePrompt } from '../server/compile.ts';
import { mockPlan } from '../server/mock.ts';

type Case = {
  id: string; note: string; sentence: string; blank?: boolean; photo?: boolean;
  history?: { role: 'user' | 'agent'; text: string }[];
  scene: { marks?: Omit<Mark, 'uid'>[]; elements?: Partial<SceneElement>[] };
  expect: { action?: string[]; region?: string[]; style?: string; includes?: string[]; orientation?: string; hingeAssumption?: boolean; arabicReply?: boolean; expand?: boolean; preserve?: boolean; rule?: boolean; live?: boolean };
};

const live = process.argv.includes('--live');
const cap = Number(process.argv.find((a) => a.startsWith('--cap='))?.split('=')[1] ?? 5);
const PER_PLAN_USD = 0.06; // conservative ceiling for one Opus 5.5 plan with two images (~$4/M in, $20/M out)
const cases = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'cases.json'), 'utf8')) as Case[];
const W = 1536, H = 1152;

function scene(c: Case): Scene {
  return {
    marks: (c.scene.marks ?? []).map((m, i) => ({ ...m, uid: `m${i}` })),
    elements: (c.scene.elements ?? []).map((e, i) => ({
      uid: `e${i}`, kind: 'catalog', ref: '', name: '', prompt: '', x: 0, y: 0, w: 100, h: 100, rotation: 0, flipX: false, hinge: null, sizeCm: null, url: `/elements/${e.ref}.svg`, ...e,
    }) as SceneElement),
  };
}

function image(c: Case): string | null {
  for (const ext of ['jpg', 'png']) {
    const f = path.join(import.meta.dirname, 'images', `${c.id}.${ext}`);
    if (fs.existsSync(f)) return `data:image/${ext === 'jpg' ? 'jpeg' : 'png'};base64,${fs.readFileSync(f).toString('base64')}`;
  }
  return null;
}

// 1x1 grey PNG stands in for a photo when none is provided (live planner still gets a "photo").
const PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

function grade(c: Case, plan: Plan): string[] {
  const e = c.expect, fails: string[] = [];
  const text = `${plan.change} ${plan.items.map((i) => `${i.what} ${i.size_cm} ${i.orientation}`).join(' ')}`.toLowerCase();
  if (e.action && !e.action.includes(plan.action)) fails.push(`action ${plan.action} ∉ ${e.action}`);
  if (e.region && !e.region.includes(plan.region)) fails.push(`region ${plan.region} ∉ ${e.region}`);
  if (e.style && plan.style !== e.style) fails.push(`style ${plan.style} ≠ ${e.style}`);
  for (const s of e.includes ?? []) if (!text.includes(s.toLowerCase())) fails.push(`missing "${s}"`);
  if (e.orientation && !plan.items.some((i) => i.orientation.toLowerCase().includes(e.orientation!))) fails.push(`orientation ≠ ${e.orientation}`);
  if (e.hingeAssumption && !plan.assumptions.some((a) => /hinge|مفصل/i.test(a.text + a.alt))) fails.push('hinge not stated as an assumption');
  if (e.arabicReply && !/[؀-ۿ]/.test(plan.reply)) fails.push('reply not in Arabic');
  if (e.expand && plan.expand_pct <= 0) fails.push('expand_pct is 0');
  if (e.preserve && plan.preserve.length < 2) fails.push('preserve list too short');
  if (e.rule && !plan.rule_suggestion) fails.push('no rule suggestion');
  return fails;
}

const planner = live ? (await import('../server/claude.ts')).planTurn : null;
const memory = live ? (await import('../server/store.ts')).getMemory() : null;
let spent = 0, pass = 0, run = 0;

for (const c of cases) {
  if (!live && c.expect.live) { console.log(`- ${c.id.padEnd(20)} skipped (live only)`); continue; }
  if (live && spent + PER_PLAN_USD > cap) { console.log(`! stopping: spend cap $${cap} reached`); break; }
  const req: TurnRequest = {
    sentence: c.sentence, lang: /[؀-ۿ]/.test(c.sentence) ? 'ar' : 'en', w: W, h: H,
    base: c.blank ? null : image(c) ?? PLACEHOLDER, overlay: c.blank ? null : image(c) ?? PLACEHOLDER,
    scene: scene(c), history: c.history ?? [],
  };
  const raw = planner ? await planner(req, memory!) : mockPlan(req);
  if (planner) spent += PER_PLAN_USD;
  const plan = Plan.parse(raw);
  compilePrompt(plan, req.scene); // must not throw
  const fails = grade(c, plan);
  run++;
  if (!fails.length) pass++;
  console.log(`${fails.length ? '✗' : '✓'} ${c.id.padEnd(20)} ${plan.action}/${plan.region}${fails.length ? `  — ${fails.join('; ')}` : ''}`);
  if (live) console.log(`    reply: ${plan.reply}\n    change: ${plan.change}`);
}
console.log(`\n${pass}/${run} passed${live ? ` · est. spend ≤ $${spent.toFixed(2)}` : ' (mock planner: contract check only)'}`);
process.exitCode = pass === run ? 0 : 1;
