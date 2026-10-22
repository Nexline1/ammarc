// Disk store under DATA_DIR: files/ (images), projects/ (JSON), memory.json, usage.json.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Memory, Project } from '../shared/types.ts';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const FILES = path.join(DATA_DIR, 'files');
const PROJECTS = path.join(DATA_DIR, 'projects');
for (const d of [FILES, PROJECTS]) fs.mkdirSync(d, { recursive: true });

const ID = /^[a-z0-9-]{8,64}(\.(png|jpg|svg|webp))?$/;
export const safeId = (id: string) => ID.test(id);

export function saveFile(buf: Buffer, ext: 'png' | 'jpg' | 'svg' | 'webp'): string {
  const name = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(FILES, name), buf);
  return name;
}
export const filePath = (name: string) => (safeId(name) ? path.join(FILES, name) : null);

const readJson = <T>(file: string, fallback: T): T => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
};
const writeJson = (file: string, data: unknown) => {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file); // atomic swap, so a crash never leaves half a project
};

export function listProjects() {
  return fs.readdirSync(PROJECTS).filter((f) => f.endsWith('.json'))
    .map((f) => readJson<Project | null>(path.join(PROJECTS, f), null))
    .filter((p): p is Project => !!p)
    .map(({ id, name, updatedAt, versions, current }) => ({ id, name, updatedAt, thumb: versions.find((v) => v.id === current)?.file ?? null }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export const getProject = (id: string) => (safeId(id) ? readJson<Project | null>(path.join(PROJECTS, `${id}.json`), null) : null);
export function putProject(p: Project) {
  if (!safeId(p.id)) throw new Error('bad id');
  writeJson(path.join(PROJECTS, `${p.id}.json`), Project.parse(p));
}

// ---------- Memory: seeded from his ChatGPT profile ----------
const SEED: Memory = {
  rules: [
    'Make only the requested change. Keep every unmentioned element exactly as it is: geometry, doors, windows, pipes, grating, handrails and plates.',
    'If asked to remove a marked item, remove only that item, never nearby components.',
    'Never guess a door hinge side or opening side; follow the latest instruction or the dropped element.',
    '"Make it 3D" means a convincing 3D industrial rendering that keeps the original geometry and the requested details.',
    'When moving a duct or pipe by a stated amount, keep its shape and routing and apply exactly that movement.',
    'Preserve identifiers and spelling exactly as written (e.g. MEC0-1721-TT1).',
    'Default look: clean white background, steel for industrial parts, realistic rendering unless asked otherwise.',
    'For a future-proposal concept marked "no colour", do not add colour emphasis.',
    'Do not invent dimensions, load ratings or compliance claims.',
  ].map((text, i) => ({ id: `r${i + 1}`, text })),
  specs: [
    ['Inspection door', '90 × 60 cm (confirm units if critical)'],
    ['Cylinders', 'keep 5 cm between cylinders when adding more'],
    ['Alumina mesh / basket', 'opening 8 mm, wire thickness 1 mm; mesh on top when requested'],
    ['Structure tube', 'square tube 40 × 40'],
    ['Steel parts', 'steel, 5 mm thickness where specified'],
    ['Trolley', 'light/white structure, motor for the wheel, rotating wheels at the front only, cast-iron wheels'],
    ['Lifting trolley', 'centre lifting with a gearbox, lifting height reduced by 60 cm, hand bar for pushing'],
    ['Safety wire rope', 'about 15 cm long, smaller than first drawn'],
    ['Gas hose', 'main gas hose routed under the burner ramp, away from underneath the panel'],
    ['Safety grating', 'between platform and duct, along all sides when asked; keep existing solid plates'],
  ].map(([part, spec], i) => ({ id: `s${i + 1}`, part, spec })),
  glossary: [
    ['metal door', 'a hinged steel inspection/access door unless he says sliding'],
    ['grating', 'open steel bar grating for walkways and steps'],
    ['make it 3D', 'industrial 3D render keeping geometry'],
    ['باب حديد', 'hinged steel door'],
  ].map(([says, means], i) => ({ id: `g${i + 1}`, says, means })),
};
const MEMORY = path.join(DATA_DIR, 'memory.json');
export const getMemory = (): Memory => readJson<Memory>(MEMORY, SEED);
export const putMemory = (m: Memory) => writeJson(MEMORY, Memory.parse(m));

// ---------- My parts (shared across projects) ----------
const PARTS = path.join(DATA_DIR, 'parts.json');
export type Part = { file: string; name: string };
export const getParts = (): Part[] => readJson<Part[]>(PARTS, []);
export function addPart(p: Part) {
  if (!safeId(p.file)) throw new Error('bad file');
  writeJson(PARTS, [{ file: p.file, name: p.name.slice(0, 60) }, ...getParts().filter((x) => x.file !== p.file)].slice(0, 300));
}
export const removePart = (file: string) => writeJson(PARTS, getParts().filter((x) => x.file !== file));

// ---------- Spend guard: paid calls per day ----------
const USAGE = path.join(DATA_DIR, 'usage.json');
type Usage = { day: string; images: number; claude: number };
export function takeSlot(kind: 'images' | 'claude', cap: number, now = new Date()): boolean {
  const day = now.toISOString().slice(0, 10);
  const saved = readJson<Partial<Usage>>(USAGE, {});
  const u: Usage = saved.day === day ? { day, images: saved.images ?? 0, claude: saved.claude ?? 0 } : { day, images: 0, claude: 0 };
  if (u[kind] >= cap) return false;
  u[kind]++;
  writeJson(USAGE, u);
  return true;
}
