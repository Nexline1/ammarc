import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { Plan, TurnRequest, type Scene } from '../shared/types.ts';
import { compilePrompt } from '../server/compile.ts';
import { describeScene } from '../server/claude.ts';
import { mockPlan } from '../server/mock.ts';

const plan: Plan = {
  action: 'edit', region: 'elements', expand_pct: 0, change: 'Replace the placeholder with a real steel inspection door.',
  items: [{ tag: 'E1', what: 'hinged steel inspection door', material: 'steel', size_cm: '90 × 60 cm', position: 'as placed', orientation: 'hinge on the left' }],
  preserve: ['yellow handrail on the left', 'gas hose under the burner ramp'], style: 'photo',
  assumptions: [], reply: 'Adding the door.', rule_suggestion: '', part_name: '',
};
const scene: Scene = {
  elements: [{ uid: 'a', kind: 'catalog', ref: 'inspection-door', name: 'Inspection door', prompt: 'hinged steel inspection door', x: 500, y: 400, w: 200, h: 150, rotation: 0, flipX: false, hinge: 'left', sizeCm: [90, 60], url: '/elements/inspection-door.svg' }],
  marks: [{ uid: 'm', type: 'dimension', points: [[100, 100], [300, 100]], text: '90 cm' }],
};

describe('compilePrompt', () => {
  it('produces the fixed CHANGE / ITEMS / KEEP EXACTLY / STYLE structure', () => {
    const p = compilePrompt(plan, scene);
    expect(p).toMatch(/^CHANGE: /);
    expect(p).toContain('ITEMS:');
    expect(p).toContain('KEEP EXACTLY');
    expect(p).toContain('yellow handrail on the left');
    expect(p).toContain('orientation: hinge on the left');
    expect(p).toContain('flat line-drawing placeholder');
    expect(p).toContain('Do not add text, labels, dimension lines');
    expect(p).toMatchSnapshot();
  });
  it('drops the keep-exactly block for whole-image renders', () => {
    expect(compilePrompt({ ...plan, region: 'whole', style: '3d_render' }, scene)).not.toContain('KEEP EXACTLY');
  });
});

describe('describeScene', () => {
  it('tells Claude positions as percentages, hinge and real size', () => {
    const d = describeScene(scene, 1000, 800);
    expect(d).toContain('E1: Inspection door');
    expect(d).toContain('centre 50% across, 50% down');
    expect(d).toContain('hinge left');
    expect(d).toContain('90×60 cm');
    expect(d).toContain('M1: dimension line');
    expect(d).toContain('"90 cm"');
  });
});

describe('schemas at the trust boundary', () => {
  it('rejects a plan with an unknown action or missing fields', () => {
    expect(Plan.safeParse({ ...plan, action: 'delete_everything' }).success).toBe(false);
    const { change: _c, ...noChange } = plan;
    expect(Plan.safeParse(noChange).success).toBe(false);
  });
  it('rejects non-image payloads in a turn', () => {
    const turn = { sentence: 'x', lang: 'en', base: 'data:text/html;base64,PHNjcmlwdD4=', overlay: null, w: 10, h: 10, scene, history: [] };
    expect(TurnRequest.safeParse(turn).success).toBe(false);
    expect(TurnRequest.safeParse({ ...turn, base: null }).success).toBe(true);
  });
});

describe('demo planner', () => {
  const base = 'data:image/png;base64,AAAA';
  const req = (sentence: string, s: Partial<Scene> = {}) => TurnRequest.parse({ sentence, lang: 'en', base, overlay: base, w: 1000, h: 800, scene: { elements: [], marks: [], ...s }, history: [] });
  it('asks only "tap where" when nothing locates the change', () => {
    expect(mockPlan(req('put a door here')).action).toBe('reply');
  });
  it('edits only the marked region and states the hinge guess', () => {
    const p = mockPlan(req('put a metal door here', { marks: [{ uid: 'm', type: 'point', points: [[10, 10]] }] }));
    expect(p.region).toBe('marks');
    expect(p.assumptions[0].text).toMatch(/hinge/i);
  });
  it('answers Arabic in Arabic', () => {
    const p = mockPlan(req('حط باب هنا', { marks: [{ uid: 'm', type: 'point', points: [[10, 10]] }] }));
    expect(p.reply).toMatch(/[؀-ۿ]/);
  });
});

describe('daily spend caps', () => {
  let takeSlot: (kind: 'images' | 'claude', cap: number, now?: Date) => boolean;
  beforeAll(async () => {
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'armature-'));
    ({ takeSlot } = await import('../server/store.ts'));
  });
  it('stops at the cap, counts images and Claude calls separately, and resets the next day', () => {
    const day1 = new Date('2026-10-21T10:00:00Z'), day2 = new Date('2026-10-22T10:00:00Z');
    expect(takeSlot('images', 2, day1)).toBe(true);
    expect(takeSlot('images', 2, day1)).toBe(true);
    expect(takeSlot('images', 2, day1)).toBe(false);
    expect(takeSlot('claude', 1, day1)).toBe(true);
    expect(takeSlot('claude', 1, day1)).toBe(false);
    expect(takeSlot('images', 2, day2)).toBe(true);
  });
});
