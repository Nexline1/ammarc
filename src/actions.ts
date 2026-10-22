// Starting points and library drops.
import type { Version } from '../shared/types.ts';
import { upload } from './api.ts';
import { board, loadCached } from './canvas/Board.tsx';
import { ASPECTS, blankBoard, normalizeFile, type Aspect } from './canvas/raster.ts';
import { elementUrl, type CatalogItem } from './elements/catalog.ts';
import { tr } from './i18n.ts';
import { addElement, edit, get, newProject, openProject, set, toast, uid, type Part } from './store.ts';

async function newBase(dataUrl: string, note: 'photo' | 'blank') {
  if (!get().project) await openProject(newProject());
  const prev = get().busy; // a turn may have started this (blank board for a text-only idea): keep it busy
  set({ busy: { stage: 'saving', text: tr(get().lang, 'saving') } });
  try {
    const file = await upload(dataUrl);
    const v: Version = { id: uid(), file, note, parent: null, at: Date.now() };
    edit((p) => ({ versions: [...p.versions, v], current: v.id, scene: { elements: [], marks: [] } }));
  } finally {
    set({ busy: prev });
  }
}

export async function startFromFile(file: File) {
  if (!file.type.startsWith('image/') || get().busy) return;
  try {
    const { dataUrl } = await normalizeFile(file);
    await newBase(dataUrl, 'photo');
  } catch (e) {
    toast((e as Error).message);
  }
}

export const startBlank = (aspect: Aspect = '1:1') => newBase(blankBoard(aspect), 'blank');

/** Resolves once the board has loaded the current image. */
export async function boardReady(timeout = 8000) {
  const t0 = Date.now();
  while (!board.api?.size()) {
    if (Date.now() - t0 > timeout) throw new Error('The board did not load.');
    await new Promise((r) => setTimeout(r, 40));
  }
  return board.api;
}

async function place(url: string, at: [number, number] | null, fields: { kind: 'catalog' | 'part'; ref: string; name: string; prompt: string; hinge: 'left' | 'right' | null; sizeCm: [number, number] | null }) {
  if (get().busy) { toast(tr(get().lang, 'waitBusy')); return; }
  if (!get().project?.current) await startBlank('1:1');
  const api = await boardReady();
  const { w, h } = api.size()!;
  const img = await loadCached(url);
  const short = Math.min(w, h);
  let ew = short * 0.28, eh = (ew * img.naturalHeight) / img.naturalWidth;
  if (eh > short * 0.5) { ew *= (short * 0.5) / eh; eh = short * 0.5; }
  const [x, y] = at ?? api.center();
  addElement({ ...fields, url, x, y, w: ew, h: eh, rotation: 0, flipX: false });
}

export const addCatalog = (item: CatalogItem, at: [number, number] | null = null) =>
  place(elementUrl(item.id), at, { kind: 'catalog', ref: item.id, name: item.en, prompt: item.prompt, hinge: item.hinge, sizeCm: item.size });

export const addPart = (part: Part, at: [number, number] | null = null) =>
  place(`/files/${part.file}`, at, { kind: 'part', ref: part.file, name: part.name, prompt: part.name, hinge: null, sizeCm: null });

export { ASPECTS };
