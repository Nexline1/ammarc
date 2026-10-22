// The board: his photo (or a blank board), dropped elements, red marks, dimensions and notes.
// World coordinates = pixels of the current base image.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Arrow, Circle, Group, Image as KImage, Label, Layer, Line, Rect, Stage, Tag, Text, Transformer } from 'react-konva';
import type { Mark, SceneElement } from '../../shared/types.ts';
import { api, fileUrl, upload } from '../api.ts';
import { tr, useT } from '../i18n.ts';
import { addMark, get, removeItem, set, toast, updateElement, useStore, type Part } from '../store.ts';
import { canvas } from './raster.ts';

export const RED = '#E5262E';
const DIM = '#2457A6';
const INK = '#16191D';

export type BoardApi = {
  exportCanvas(opts: { marks: 'none' | 'annotations' | 'all'; tags?: boolean }): HTMLCanvasElement | null;
  worldFromClient(x: number, y: number): [number, number] | null;
  size(): { w: number; h: number } | null;
  base(): HTMLImageElement | null;
  center(): [number, number];
  scale(): number;
  zoom(f: number): void;
  fit(): void;
};
export const board: { api: BoardApi | null } = { api: null };

// ---------- images ----------
const cache = new Map<string, HTMLImageElement>();
export function loadCached(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src);
  if (hit?.complete && hit.naturalWidth) return Promise.resolve(hit);
  return new Promise((res, rej) => {
    const img = hit ?? new Image();
    if (!hit) { img.src = src; cache.set(src, img); }
    img.addEventListener('load', () => res(img), { once: true });
    img.addEventListener('error', () => { cache.delete(src); rej(new Error('Image failed to load')); }, { once: true });
  });
}
function useImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let alive = true;
    if (!src) { setImg(null); return; }
    const done = (i: HTMLImageElement) => alive && setImg(i);
    if (src.startsWith('data:')) {
      const i = new Image();
      i.onload = () => done(i);
      i.src = src;
    } else loadCached(src).then(done, () => alive && setImg(null));
    return () => { alive = false; };
  }, [src]);
  return img;
}

// ---------- geometry ----------
type P = { x: number; y: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: P, b: P) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clampScale = (s: number, fit: number) => Math.min(8, Math.max(fit * 0.4, s));
type Gesture =
  | { kind: 'pan'; start: P; v0: View }
  | { kind: 'pinch'; d0: number; m0: P; v0: View }
  | { kind: 'draw' }
  | { kind: 'erase' }
  | { kind: 'tap'; at: P };
type View = { scale: number; x: number; y: number };

export function Board({ onFiles }: { onFiles: (files: FileList) => void }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const tool = useStore((s) => s.tool);
  const selected = useStore((s) => s.selected);
  const preview = useStore((s) => s.preview);
  const pending = useStore((s) => s.pending);
  const busy = useStore((s) => s.busy);

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [draft, setDraft] = useState<Mark | null>(null);
  const draftRef = useRef<Mark | null>(null);
  draftRef.current = draft;
  const pointers = useRef(new Map<number, P>());
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);

  const version = project?.versions.find((v) => v.id === project.current) ?? null;
  const baseImg = useImage(version ? fileUrl(version.file) : null);
  const previewImg = useImage(preview);
  const W = baseImg?.naturalWidth ?? 0, H = baseImg?.naturalHeight ?? 0;
  const short = Math.min(W, H) || 1000;
  const fitScale = W && box.w ? Math.min((box.w - (box.w < 600 ? 24 : 96)) / W, (box.h - (box.w < 600 ? 24 : 96)) / H) : 1;

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { set({ zoom: view.scale }); }, [view.scale]);

  const fit = useCallback(() => {
    if (!W || !box.w) return;
    setView({ scale: fitScale, x: (box.w - W * fitScale) / 2, y: (box.h - H * fitScale) / 2 });
  }, [W, H, box.w, box.h, fitScale]);
  useEffect(fit, [fit]);

  const toWorld = (p: P): [number, number] => {
    const v = viewRef.current;
    return [(p.x - v.x) / v.scale, (p.y - v.y) / v.scale];
  };
  const local = (e: { clientX: number; clientY: number }): P => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const zoomAt = (p: P, s: number) => {
    const v = viewRef.current;
    const ns = clampScale(s, fitScale);
    const wx = (p.x - v.x) / v.scale, wy = (p.y - v.y) / v.scale;
    setView({ scale: ns, x: p.x - wx * ns, y: p.y - wy * ns });
  };

  // ---------- API for turn/export/library ----------
  useEffect(() => {
    board.api = {
      size: () => (W ? { w: W, h: H } : null),
      base: () => baseImg,
      center: () => {
        const [x, y] = toWorld({ x: box.w / 2, y: box.h / 2 });
        return [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))];
      },
      worldFromClient: (cx, cy) => {
        const r = wrapRef.current?.getBoundingClientRect();
        if (!r || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
        return toWorld({ x: cx - r.left, y: cy - r.top });
      },
      scale: () => viewRef.current.scale,
      zoom: (f) => zoomAt({ x: box.w / 2, y: box.h / 2 }, viewRef.current.scale * f),
      fit,
      exportCanvas: ({ marks, tags }) => {
        const stage = stageRef.current, layer = layerRef.current;
        if (!stage || !layer || !baseImg) return null;
        const restore: [Konva.Node, boolean][] = [];
        const vis = (n: Konva.Node, v: boolean) => { if (n.visible() !== v) { restore.push([n, n.visible()]); n.visible(v); } };
        if (trRef.current) vis(trRef.current, false);
        layer.find('.grid, .preview, .draft').forEach((n) => vis(n, false));
        layer.find('.basepic').forEach((n) => vis(n, true));
        layer.find('.mark').forEach((n) => {
          const type = n.getAttr('markType');
          vis(n, marks === 'all' || (marks === 'annotations' && (type === 'dimension' || type === 'text')));
        });
        layer.find('.tags').forEach((n) => vis(n, !!tags));
        const old = { s: stage.scaleX(), x: stage.x(), y: stage.y() };
        stage.scale({ x: 1, y: 1 });
        stage.position({ x: 0, y: 0 });
        const out = layer.toCanvas({ x: 0, y: 0, width: W, height: H, pixelRatio: 1 });
        stage.scale({ x: old.s, y: old.s });
        stage.position({ x: old.x, y: old.y });
        restore.forEach(([n, v]) => n.visible(v));
        layer.batchDraw();
        return out;
      },
    };
  });

  // ---------- transformer follows the selected element ----------
  useEffect(() => {
    const tr = trRef.current, stage = stageRef.current;
    if (!tr || !stage) return;
    const node = selected ? stage.findOne((n: Konva.Node) => n.id() === selected) : null;
    tr.nodes(node && node.hasName('element') && tool === 'select' ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, tool, project?.scene.elements]);

  // ---------- space to pan ----------
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,textarea')) { space.current = true; e.preventDefault(); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const stopDrags = () => stageRef.current?.find('.element').forEach((n) => n.isDragging() && n.stopDrag());
  const itemId = (target: Konva.Node) => target.findAncestor('.item', true)?.id() ?? null;
  const eraseAt = (p: P) => {
    const hit = stageRef.current?.getIntersection(p);
    const id = hit ? itemId(hit) : null;
    if (id) removeItem(id);
  };

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {
    const evt = e.evt;
    const p = local(evt);
    pointers.current.set(evt.pointerId, p);
    if (pointers.current.size === 2) {
      stopDrags();
      setDraft(null);
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', d0: dist(a, b) || 1, m0: mid(a, b), v0: viewRef.current };
      return;
    }
    if (pointers.current.size > 2 || !baseImg || get().busy) return;
    const w = toWorld(p);
    const id = itemId(e.target);
    if (space.current || evt.button === 1) { gesture.current = { kind: 'pan', start: p, v0: viewRef.current }; return; }
    switch (tool) {
      case 'select':
        if (id) { set({ selected: id }); gesture.current = null; }
        else { set({ selected: null }); gesture.current = { kind: 'pan', start: p, v0: viewRef.current }; }
        break;
      case 'pen':
      case 'lasso':
        setDraft({ uid: 'draft', type: 'pen', points: [w] });
        gesture.current = { kind: 'draw' };
        break;
      case 'arrow':
      case 'dimension':
        setDraft({ uid: 'draft', type: tool, points: [w, w] });
        gesture.current = { kind: 'draw' };
        break;
      case 'text':
        gesture.current = { kind: 'tap', at: p };
        break;
      case 'eraser':
        eraseAt(p);
        gesture.current = { kind: 'erase' };
        break;
    }
  };

  const onPointerMove = (e: KonvaEventObject<PointerEvent>) => {
    const evt = e.evt;
    if (!pointers.current.has(evt.pointerId)) return;
    const p = local(evt);
    pointers.current.set(evt.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const m = mid(a, b);
      const s = clampScale(g.v0.scale * (dist(a, b) / g.d0), fitScale);
      const wx = (g.m0.x - g.v0.x) / g.v0.scale, wy = (g.m0.y - g.v0.y) / g.v0.scale;
      setView({ scale: s, x: m.x - wx * s, y: m.y - wy * s });
    } else if (g.kind === 'pan') {
      setView({ ...g.v0, x: g.v0.x + p.x - g.start.x, y: g.v0.y + p.y - g.start.y });
    } else if (g.kind === 'draw' && draftRef.current) {
      const d = draftRef.current;
      const w = toWorld(p);
      if (d.type === 'pen') {
        const last = d.points[d.points.length - 1];
        if (Math.hypot(w[0] - last[0], w[1] - last[1]) * viewRef.current.scale > 2) setDraft({ ...d, points: [...d.points, w] });
      } else setDraft({ ...d, points: [d.points[0], w] });
    } else if (g.kind === 'erase') eraseAt(p);
  };

  const finish = (cancelled: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    const d = draftRef.current;
    setDraft(null);
    if (cancelled || !g) return;
    const s = viewRef.current.scale;
    if (g.kind === 'tap' && tool === 'text') {
      set({ pending: { kind: 'text', at: toWorld(g.at), points: [toWorld(g.at)], value: '' } });
      return;
    }
    if (g.kind !== 'draw' || !d) return;
    const round = (pts: [number, number][]) => pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number]);
    if (tool === 'pen') {
      let len = 0;
      for (let i = 1; i < d.points.length; i++) len += Math.hypot(d.points[i][0] - d.points[i - 1][0], d.points[i][1] - d.points[i - 1][1]);
      if (len * s < 8) addMark({ type: 'point', points: round([d.points[0]]) });
      else addMark({ type: 'pen', points: round(d.points) });
    } else if (tool === 'lasso') {
      if (d.points.length > 3) void cutPart(d.points);
    } else if (tool === 'arrow' || tool === 'dimension') {
      const [a, b] = d.points;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) * s < 12) return;
      if (tool === 'arrow') addMark({ type: 'arrow', points: round(d.points) });
      else set({ pending: { kind: 'dimension', at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], points: round(d.points), value: '' } });
    }
  };
  const onPointerUp = (e: KonvaEventObject<PointerEvent>) => {
    pointers.current.delete(e.evt.pointerId);
    if (gesture.current?.kind === 'pinch') { if (pointers.current.size < 2) gesture.current = null; return; }
    finish(false);
  };
  const onPointerCancel = (e: KonvaEventObject<PointerEvent>) => {
    pointers.current.delete(e.evt.pointerId);
    finish(true);
  };
  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const evt = e.evt;
    if (evt.ctrlKey || evt.metaKey) zoomAt(local(evt), viewRef.current.scale * Math.exp(-evt.deltaY * 0.01));
    else setView((v) => ({ ...v, x: v.x - evt.deltaX, y: v.y - evt.deltaY }));
  };

  async function cutPart(points: [number, number][]) {
    if (!baseImg) return;
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const x1 = Math.min(W, Math.ceil(Math.max(...xs))), y1 = Math.min(H, Math.ceil(Math.max(...ys)));
    if (x1 - x0 < 8 || y1 - y0 < 8) return;
    const c = canvas(x1 - x0, y1 - y0);
    const ctx = c.getContext('2d')!;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x - x0, y - y0) : ctx.moveTo(x - x0, y - y0)));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(baseImg, -x0, -y0);
    set({ pending: { kind: 'part', at: [(x0 + x1) / 2, y0], points, value: '', cut: c.toDataURL('image/png') } });
  }

  const sw = short * 0.005; // mark stroke, in image px
  const marks = project?.scene.marks ?? [];
  const elements = project?.scene.elements ?? [];
  const showPreview = !!(preview && previewImg);

  return (
    <div
      ref={wrapRef}
      className={`board tool-${tool}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); onFiles(e.dataTransfer.files); } }}
    >
      {box.w > 0 && (
        <Stage
          ref={stageRef}
          width={box.w}
          height={box.h}
          scaleX={view.scale}
          scaleY={view.scale}
          x={view.x}
          y={view.y}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={(e) => { if (e.evt.pointerType === 'mouse' && gesture.current?.kind !== 'draw') { pointers.current.delete(e.evt.pointerId); } }}
          onWheel={onWheel}
        >
          <Layer ref={layerRef}>
            {baseImg && (
              <>
                <Rect name="shadow" width={W} height={H} fill="#fff" shadowColor="#16191D" shadowOpacity={0.12} shadowBlur={24 / view.scale} shadowOffsetY={6 / view.scale} listening={false} />
                <KImage name="basepic" image={baseImg} width={W} height={H} visible={!showPreview} />
                {showPreview && <KImage name="preview" image={previewImg!} width={W} height={H} listening={false} />}
                {version?.note === 'blank' && <Grid w={W} h={H} step={short / 16} scale={view.scale} />}
              </>
            )}
            {!showPreview && elements.map((el) => <ElementNode key={el.uid} el={el} draggable={tool === 'select' && !busy} />)}
            {marks.map((m) => <MarkNode key={m.uid} m={m} short={short} sw={sw} scale={view.scale} selected={m.uid === selected} />)}
            {draft && <MarkNode m={draft} short={short} sw={sw} scale={view.scale} draft lasso={tool === 'lasso'} />}
            <Tags elements={elements} marks={marks} short={short} />
            <Transformer
              ref={trRef}
              rotateAnchorOffset={28}
              anchorSize={matchMedia('(pointer: coarse)').matches ? 18 : 11}
              anchorCornerRadius={6}
              anchorStroke="#CF5A1E"
              anchorFill="#fff"
              borderStroke="#CF5A1E"
              borderStrokeWidth={1.5}
              keepRatio
              flipEnabled={false}
              boundBoxFunc={(oldB, newB) => (Math.abs(newB.width) < 12 || Math.abs(newB.height) < 12 ? oldB : newB)}
            />
          </Layer>
        </Stage>
      )}
      {pending && <PendingInput view={view} />}
      {busy && busy.stage !== 'checking' && <div className="board-busy" aria-live="polite"><Progress stage={busy.stage} /></div>}
      {project && !baseImg && version && <div className="board-loading">{t('saving')}</div>}
    </div>
  );
}

/** Reading -> Drawing -> Saving, so a 30-second render never feels like a frozen screen. */
function Progress({ stage }: { stage: 'thinking' | 'rendering' | 'checking' | 'saving' }) {
  const t = useT();
  const at = stage === 'thinking' ? 0 : stage === 'rendering' ? 1 : 2;
  const steps = [t('stepRead'), t('stepDraw'), t('stepSave')];
  return (
    <ol className="progress" aria-label={steps[at]}>
      {steps.map((s, i) => (
        <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>
          <span className="dot" aria-hidden="true">{i < at ? '✓' : i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

function Grid({ w, h, step, scale }: { w: number; h: number; step: number; scale: number }) {
  const lines: number[][] = [];
  for (let x = step; x < w; x += step) lines.push([x, 0, x, h]);
  for (let y = step; y < h; y += step) lines.push([0, y, w, y]);
  return <Group name="grid" listening={false}>{lines.map((p, i) => <Line key={i} points={p} stroke="#E4E7EB" strokeWidth={1 / scale} />)}</Group>;
}

/** The flip lives on the inner image, the transformer on the outer group, so resizing a flipped door never turns it upside down. */
function ElementNode({ el, draggable }: { el: SceneElement; draggable: boolean }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => { loadCached(el.url).then(setImg, () => setImg(null)); }, [el.url]);
  return (
    <Group
      id={el.uid}
      name="item element"
      x={el.x}
      y={el.y}
      rotation={el.rotation}
      draggable={draggable}
      onDragStart={() => set({ selected: el.uid })}
      onDragEnd={(e) => updateElement(el.uid, { x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        const n = e.target;
        const sx = Math.abs(n.scaleX()), sy = Math.abs(n.scaleY());
        n.scale({ x: 1, y: 1 });
        updateElement(el.uid, { x: n.x(), y: n.y(), w: Math.max(8, el.w * sx), h: Math.max(8, el.h * sy), rotation: n.rotation() });
      }}
    >
      <KImage image={img ?? undefined} width={el.w} height={el.h} offsetX={el.w / 2} offsetY={el.h / 2} scaleX={el.flipX ? -1 : 1} />
    </Group>
  );
}

function MarkNode({ m, short, sw, scale, selected, draft, lasso }: { m: Mark; short: number; sw: number; scale: number; selected?: boolean; draft?: boolean; lasso?: boolean }) {
  const flat = m.points.flat();
  const hit = Math.max(sw * 3, 16 / scale);
  const glow = selected ? { shadowColor: '#CF5A1E', shadowBlur: 12 / scale, shadowOpacity: 1 } : {};
  const common = { id: draft ? undefined : m.uid, name: draft ? 'draft' : 'item mark', markType: m.type } as const;
  if (m.type === 'pen') {
    return <Line {...common} {...glow} points={flat} stroke={lasso ? INK : RED} strokeWidth={lasso ? 2 / scale : sw} dash={lasso ? [8 / scale, 6 / scale] : undefined} lineCap="round" lineJoin="round" tension={0.3} hitStrokeWidth={hit} />;
  }
  if (m.type === 'point') {
    return <Circle {...common} {...glow} x={m.points[0][0]} y={m.points[0][1]} radius={short * 0.014} fill={RED} stroke="#fff" strokeWidth={sw * 0.6} hitStrokeWidth={hit} />;
  }
  if (m.type === 'arrow') {
    return <Arrow {...common} {...glow} points={flat} stroke={RED} fill={RED} strokeWidth={sw} pointerLength={short * 0.03} pointerWidth={short * 0.026} lineCap="round" hitStrokeWidth={hit} />;
  }
  const [a, b] = m.points;
  if (m.type === 'dimension') {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const tk = short * 0.014, nx = -Math.sin(ang) * tk, ny = Math.cos(ang) * tk;
    const fs = short * 0.026;
    return (
      <Group {...common} {...glow}>
        <Line points={flat} stroke={DIM} strokeWidth={sw * 0.7} hitStrokeWidth={hit} />
        <Line points={[a[0] - nx, a[1] - ny, a[0] + nx, a[1] + ny]} stroke={DIM} strokeWidth={sw * 0.7} />
        <Line points={[b[0] - nx, b[1] - ny, b[0] + nx, b[1] + ny]} stroke={DIM} strokeWidth={sw * 0.7} />
        {m.text && (
          <Label x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2}>
            <Tag fill="#fff" stroke={DIM} strokeWidth={sw * 0.4} cornerRadius={fs * 0.3} pointerDirection="none" />
            <Text text={m.text} fontSize={fs} fontStyle="600" fill={DIM} padding={fs * 0.3} fontFamily="system-ui, sans-serif" offsetY={fs * 0.8} />
          </Label>
        )}
      </Group>
    );
  }
  const fs = short * 0.026;
  return (
    <Label {...common} {...glow} x={a[0]} y={a[1]}>
      <Tag fill="rgba(255,255,255,0.94)" stroke={INK} strokeWidth={sw * 0.3} cornerRadius={fs * 0.35} />
      <Text text={m.text || ''} fontSize={fs} fill={INK} padding={fs * 0.4} fontFamily="system-ui, 'IBM Plex Sans Arabic', sans-serif" />
    </Label>
  );
}

/** E#/M# badges: only ever drawn into the overlay image Claude reads. */
function Tags({ elements, marks, short }: { elements: SceneElement[]; marks: Mark[]; short: number }) {
  const fs = short * 0.03;
  const badge = (key: string, text: string, x: number, y: number) => (
    <Label key={key} x={x} y={y}>
      <Tag fill={INK} cornerRadius={fs * 0.3} />
      <Text text={text} fontSize={fs} fontStyle="bold" fill="#fff" padding={fs * 0.25} fontFamily="system-ui, sans-serif" />
    </Label>
  );
  return (
    <Group name="tags" visible={false} listening={false}>
      {elements.map((e, i) => badge(e.uid, `E${i + 1}`, e.x - e.w / 2, e.y - e.h / 2 - fs * 1.6))}
      {marks.map((m, i) => {
        const xs = m.points.map((p) => p[0]), ys = m.points.map((p) => p[1]);
        return badge(m.uid, `M${i + 1}`, Math.min(...xs), Math.min(...ys) - fs * 1.6);
      })}
    </Group>
  );
}

// ---------- inline input for dimension values, notes and part names ----------
function PendingInput({ view }: { view: View }) {
  const pending = useStore((s) => s.pending)!;
  const lang = useStore((s) => s.lang);
  const [value, setValue] = useState(pending.kind === 'part' ? '' : pending.value);
  const left = pending.at[0] * view.scale + view.x, top = pending.at[1] * view.scale + view.y;
  const label = pending.kind === 'dimension' ? tr(lang, 'valueDim') : pending.kind === 'text' ? tr(lang, 'valueNote') : tr(lang, 'partName');
  const commit = async () => {
    const v = value.trim();
    set({ pending: null });
    if (!v) return;
    if (pending.kind === 'dimension') addMark({ type: 'dimension', points: pending.points, text: v });
    else if (pending.kind === 'text') addMark({ type: 'text', points: pending.points, text: v });
    else if (pending.cut) {
      try {
        const file = await upload(pending.cut);
        await api.post('/api/parts', { file, name: v });
        set((s) => ({ parts: [{ file, name: v } as Part, ...s.parts], tool: 'select' }));
        toast(tr(lang, 'partSaved'));
      } catch (e) { toast((e as Error).message); }
    }
  };
  return (
    <form className="pending" style={{ left, top }} onSubmit={(e) => { e.preventDefault(); void commit(); }}>
      <input autoFocus value={value} dir="auto" placeholder={label} aria-label={label} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && set({ pending: null })} />
      <button type="submit" className="btn primary sm">{tr(lang, 'save')}</button>
      <button type="button" className="btn ghost sm" onClick={() => set({ pending: null })}>{tr(lang, 'cancel')}</button>
    </form>
  );
}
