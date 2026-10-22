// One small global store (useSyncExternalStore) + the actions that change the board.
import { useSyncExternalStore } from 'react';
import type { Lang, Mark, Memory, Message, Project, Scene, SceneElement } from '../shared/types.ts';
import { api } from './api.ts';

export type Tool = 'select' | 'pen' | 'arrow' | 'dimension' | 'text' | 'eraser' | 'lasso';
export type Sheet = 'elements' | 'chat' | 'versions' | 'export' | 'memory' | 'projects';
export type LeftTab = 'elements' | 'parts' | 'versions' | 'ideas';
export type Part = { file: string; name: string };
export type Pending = { kind: 'dimension' | 'text' | 'part'; at: [number, number]; points: [number, number][]; value: string; cut?: string };
type Snapshot = { current: string | null; scene: Scene };
export type ProjectSummary = { id: string; name: string; updatedAt: number; thumb: string | null };

export type State = {
  status: { mock: boolean; auth: boolean; authed: boolean } | null;
  project: Project | null;
  projects: ProjectSummary[];
  parts: Part[];
  memory: Memory | null;
  tool: Tool;
  selected: string | null;
  lang: Lang;
  busy: { stage: 'thinking' | 'rendering' | 'checking' | 'saving'; text: string } | null;
  preview: string | null;
  compare: boolean;
  past: Snapshot[];
  future: Snapshot[];
  sheet: Sheet | null;
  draft: string;
  toast: string | null;
  pending: Pending | null;
  hint: string | null;
  awaiting: string | null; // sentence waiting for him to tap a location
  dragging: boolean; // a library tile is being dragged (the phone sheet hides but stays mounted)
  left: LeftTab | null; // laptop rail: which panel is open (null = collapsed, more room for the photo)
  zoom: number; // board zoom, 1 = 100 %
};

const savedLang = (() => { try { return localStorage.getItem('arm-lang') as Lang | null; } catch { return null; } })();

let state: State = {
  status: null, project: null, projects: [], parts: [], memory: null,
  tool: 'select', selected: null, lang: savedLang === 'ar' ? 'ar' : 'en',
  busy: null, preview: null, compare: false, past: [], future: [], sheet: null,
  draft: '', toast: null, pending: null, hint: null, awaiting: null, dragging: false, left: 'elements', zoom: 1,
};
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export const get = () => state;
export function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
/** Select a value that already lives in the state (no new objects, or React re-renders forever). */
export const useStore = <T,>(sel: (s: State) => T): T => useSyncExternalStore(subscribe, () => sel(state));

export const uid = () => crypto.randomUUID().slice(0, 12);
let toastTimer = 0;
export function toast(text: string) {
  set({ toast: text });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => set({ toast: null }), 3200);
}

// ---------- project + autosave ----------
let saveTimer = 0;
let saving: Promise<unknown> = Promise.resolve();
/** Saves run one after another, so a slow older save can never land after a newer one. */
function saveNow() {
  clearTimeout(saveTimer);
  const p = state.project;
  if (p) saving = saving.then(() => api.put(`/api/projects/${p.id}`, p)).catch(() => toast(state.lang === 'ar' ? 'ما انحفظ — تأكد من الاتصال.' : 'Could not save — check the connection.'));
  return saving;
}
export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, 600);
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow());

const snap = (p: Project): Snapshot => ({ current: p.current, scene: p.scene });

/** Change the project. history=true makes it undoable. */
export function edit(fn: (p: Project) => Partial<Project>, history = true) {
  const p = state.project;
  if (!p) return;
  const next = { ...p, ...fn(p), updatedAt: Date.now() };
  set((s) => ({ project: next, ...(history ? { past: [...s.past.slice(-49), snap(p)], future: [] } : {}) }));
  scheduleSave();
}
/** The board is frozen while a turn runs: what Claude planned on is exactly what gets rendered. */
export const editScene = (fn: (s: Scene) => Partial<Scene>, history = true) => {
  if (state.busy) return;
  edit((p) => ({ scene: { ...p.scene, ...fn(p.scene) } }), history);
};

export function undo() {
  const { past, project } = state;
  if (!past.length || !project || state.busy) return;
  set((s) => ({ past: past.slice(0, -1), future: [snap(project), ...s.future], project: { ...project, ...past[past.length - 1] }, selected: null, awaiting: null, hint: null }));
  scheduleSave();
}
export function redo() {
  const { future, project } = state;
  if (!future.length || !project || state.busy) return;
  set((s) => ({ future: future.slice(1), past: [...s.past, snap(project)], project: { ...project, ...future[0] }, selected: null, awaiting: null, hint: null }));
  scheduleSave();
}

export function newProject(name = 'Untitled idea'): Project {
  return { id: crypto.randomUUID(), name, updatedAt: Date.now(), versions: [], current: null, scene: { elements: [], marks: [] }, messages: [] };
}
export async function openProject(p: Project) {
  if (state.busy) { toast(state.lang === 'ar' ? 'لحظة — أخلص التعديل الحالي.' : 'One moment — finishing the current change.'); return; }
  await saveNow();
  set({ project: p, past: [], future: [], selected: null, preview: null, compare: false, pending: null, sheet: null, awaiting: null, hint: null });
  try { localStorage.setItem('arm-project', p.id); } catch { /* private mode */ }
}

export function addMessage(m: Omit<Message, 'id'>) {
  edit((p) => ({ messages: [...p.messages, { ...m, id: uid() }].slice(-200) }), false);
}

// ---------- scene actions ----------
export function addElement(el: Omit<SceneElement, 'uid'>) {
  const e = { ...el, uid: uid() };
  editScene((s) => ({ elements: [...s.elements, e] }));
  set({ selected: e.uid, tool: 'select' });
}
export const updateElement = (id: string, patch: Partial<SceneElement>, history = true) =>
  editScene((s) => ({ elements: s.elements.map((e) => (e.uid === id ? { ...e, ...patch } : e)) }), history);

export function addMark(m: Omit<Mark, 'uid'>) {
  editScene((s) => ({ marks: [...s.marks, { ...m, uid: uid() }] }));
}
export function removeItem(id: string) {
  editScene((s) => ({ elements: s.elements.filter((e) => e.uid !== id), marks: s.marks.filter((m) => m.uid !== id) }));
  if (state.selected === id) set({ selected: null });
}
export function duplicate(id: string) {
  const e = state.project?.scene.elements.find((x) => x.uid === id);
  if (!e) return;
  const shift = Math.max(e.w, e.h) * 0.12;
  addElement({ ...e, x: e.x + shift, y: e.y + shift });
}
export function flip(id: string) {
  const e = state.project?.scene.elements.find((x) => x.uid === id);
  if (!e) return;
  updateElement(id, { flipX: !e.flipX, hinge: e.hinge ? (e.hinge === 'left' ? 'right' : 'left') : null });
}

export function setLang(lang: Lang) {
  set({ lang });
  try { localStorage.setItem('arm-lang', lang); } catch { /* ignore */ }
}
