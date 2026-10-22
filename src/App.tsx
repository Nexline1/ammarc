import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BRAND, type Project } from '../shared/types.ts';
import { api, fileUrl, setAuthHandler } from './api.ts';
import { startBlank, startFromFile } from './actions.ts';
import { Board, board } from './canvas/Board.tsx';
import { ASPECTS, type Aspect } from './canvas/raster.ts';
import { tr, useT, type Key } from './i18n.ts';
import { Agent, Composer, MemorySheet, toggleMic } from './panels/Agent.tsx';
import { ExportSheet } from './panels/Export.tsx';
import { Library } from './panels/Library.tsx';
import { Compare, parentOf, Versions } from './panels/Versions.tsx';
import { duplicate, edit, flip, get, newProject, openProject, redo, removeItem, set, setLang, undo, updateElement, useStore, type LeftTab, type ProjectSummary, type Sheet as SheetName, type State, type Tool } from './store.ts';
import { runTurn } from './turn.ts';
import { Icon } from './ui/Icon.tsx';
import { Sheet } from './ui/Sheet.tsx';

// Three panels need room for the board; below this the board goes full-screen with sheets (phones, tablets).
const mq = matchMedia('(min-width: 1200px)');
const useWide = () => useSyncExternalStore((cb) => { mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); }, () => mq.matches);

async function boot() {
  const [projects, parts] = await Promise.all([api.get<ProjectSummary[]>('/api/projects'), api.get<State['parts']>('/api/parts')]);
  set({ projects, parts });
  let last: string | null = null;
  try { last = localStorage.getItem('arm-project'); } catch { /* ignore */ }
  const fresh = new URLSearchParams(location.search).has('new'); // /?new opens a blank idea
  const id = fresh ? undefined : projects.find((p) => p.id === last)?.id ?? projects[0]?.id;
  await openProject(id ? await api.get<Project>(`/api/projects/${id}`) : newProject());
}

export function App() {
  const status = useStore((s) => s.status);
  const lang = useStore((s) => s.lang);
  useEffect(() => {
    setAuthHandler(() => set((s) => ({ status: s.status && { ...s.status, authed: false } })));
    api.get<NonNullable<State['status']>>('/api/status').then((st) => {
      set({ status: st });
      if (!st.auth || st.authed) void boot();
    }).catch(() => set({ toast: 'Server not reachable.' }));
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  if (!status) return <div className="splash"><Wordmark /></div>;
  if (status.auth && !status.authed) return <Login />;
  return <Studio />;
}

function Wordmark() {
  return (
    <span className="wordmark" aria-label={BRAND.name}>
      <svg className="mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" /><path d="M9 23L16 8l7 15M11.5 18h9" /></svg>
      {BRAND.name}
    </span>
  );
}

function Login() {
  const t = useT();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  return (
    <main className="login">
      <form onSubmit={async (e) => {
        e.preventDefault();
        try { await api.post('/api/login', { password: pw }); set((s) => ({ status: s.status && { ...s.status, authed: true } })); void boot(); } catch { setErr(true); }
      }}>
        <Wordmark />
        <p className="muted">{BRAND.tagline}</p>
        <label className="field"><span>{t('password')}</span><input type="password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(false); }} autoComplete="current-password" /></label>
        {err && <p className="error" role="alert">{t('wrong')}</p>}
        <button className="btn primary" type="submit">{t('signIn')}</button>
      </form>
    </main>
  );
}

function Studio() {
  const t = useT();
  const wide = useWide();
  const project = useStore((s) => s.project);
  const sheet = useStore((s) => s.sheet);
  const compare = useStore((s) => s.compare);
  const toastMsg = useStore((s) => s.toast);
  const hint = useStore((s) => s.hint);
  const status = useStore((s) => s.status);
  const dragging = useStore((s) => s.dragging);
  const left = useStore((s) => s.left);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasImage = !!project?.current;

  useShortcuts();
  useAwaitingTap();
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); void startFromFile(f); }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, []);
  const onFiles = (files: FileList) => { const f = [...files].find((x) => x.type.startsWith('image/')); if (f) void startFromFile(f); };
  const close = () => set({ sheet: null });
  const titles: Record<SheetName, Key> = { elements: 'elements', chat: 'assistant', versions: 'versions', export: 'export', memory: 'memory', projects: 'projects' };

  return (
    <div className={`app ${wide ? 'wide' : 'compact'}`}>
      <header className="topbar">
        <Wordmark />
        <button className="project-name" onClick={() => set(wide ? { left: 'ideas' } : { sheet: 'projects' })} title={t('projects')}>
          <span dir="auto">{project?.name ?? '…'}</span><Icon name="chevron" size={16} />
        </button>
        <div className="spacer" />
        {status?.mock && <span className="pill demo" title={t('demoTip')}>{t('demo')}</span>}
        <button className="btn ghost sm lang" onClick={() => setLang(get().lang === 'en' ? 'ar' : 'en')} aria-label={t('language')}>
          <Icon name="globe" size={18} />{get().lang === 'en' ? 'عربي' : 'EN'}
        </button>
        {wide && <button className="btn primary" disabled={!hasImage} onClick={() => set({ sheet: 'export' })}><Icon name="export" size={18} />{t('export')}</button>}
      </header>

      <main className={`workspace${wide && !left ? ' collapsed' : ''}`}>
        {wide && <Rail />}
        {wide && left && (
          <aside className="panel left" aria-label={t(RAIL.find((r) => r.id === left)!.label)}>
            {left === 'elements' && <Library compact={false} tab="elements" />}
            {left === 'parts' && <Library compact={false} tab="parts" />}
            {left === 'versions' && <div className="panel-scroll"><h2 className="panel-title">{t('versions')}</h2><Versions /></div>}
            {left === 'ideas' && <div className="panel-scroll"><h2 className="panel-title">{t('ideas')}</h2><Projects /></div>}
          </aside>
        )}
        <section className="stage-area" aria-label="Board">
          <Board onFiles={onFiles} />
          {project && !project.versions.length && <EmptyState onPick={() => fileInput.current?.click()} />}
          {hasImage && <Toolbar wide={wide} />}
          {hasImage && wide && <BottomBar />}
          {hint
            ? <div className="hint" role="status">{hint}<button className="icon-btn sm" aria-label={t('close')} onClick={() => set({ hint: null, awaiting: null, tool: 'select' })}><Icon name="close" size={14} /></button></div>
            : hasImage && <ToolHint />}
          {compare && <Compare />}
          {!wide && <LastReply />}
        </section>
        {wide && <aside className="panel right" aria-label={t('assistant')}><Agent compact={false} /></aside>}
      </main>

      {!wide && <Dock />}
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ''; }} />
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}

      <Sheet open={!!sheet} onClose={close} wide={wide} hidden={dragging} title={sheet ? t(titles[sheet]) : ''} size={sheet === 'export' || sheet === 'memory' ? 'lg' : 'md'}>
        {sheet === 'elements' && <Library compact />}
        {sheet === 'chat' && <div className="chat-sheet"><Agent compact /><Composer autoFocus /></div>}
        {sheet === 'versions' && <Versions onPick={close} />}
        {sheet === 'export' && <ExportSheet />}
        {sheet === 'memory' && <MemorySheet />}
        {sheet === 'projects' && <Projects />}
      </Sheet>
    </div>
  );
}

const RAIL: { id: LeftTab; icon: string; label: Key }[] = [
  { id: 'elements', icon: 'grid', label: 'elements' },
  { id: 'parts', icon: 'lasso', label: 'myParts' },
  { id: 'versions', icon: 'layers', label: 'versions' },
  { id: 'ideas', icon: 'image', label: 'ideas' },
];

/** Canva-style rail: pick a page; click the open one again to fold the panel away and give the photo more room. */
function Rail() {
  const t = useT();
  const left = useStore((s) => s.left);
  const count = useStore((s) => s.project?.versions.length ?? 0);
  return (
    <nav className="rail" aria-label={t('menu')}>
      {RAIL.map((r) => (
        <button key={r.id} className={`rail-btn${left === r.id ? ' on' : ''}`} aria-pressed={left === r.id}
          title={left === r.id ? t('hidePanel') : t(r.label)} onClick={() => set({ left: left === r.id ? null : r.id })}>
          <Icon name={r.icon} size={22} />
          <span>{t(r.label)}</span>
          {r.id === 'versions' && count > 0 && <b className="badge">{count}</b>}
        </button>
      ))}
    </nav>
  );
}

/** One quiet line under the toolbar saying how the active tool works. */
function ToolHint() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const busy = useStore((s) => s.busy);
  const keys: Partial<Record<Tool, Key>> = { pen: 'hintPen', arrow: 'hintArrow', dimension: 'hintDimension', text: 'hintText', eraser: 'hintEraser', lasso: 'hintLasso' };
  const k = keys[tool];
  if (!k || busy) return null;
  return <div className="tool-hint" role="status">{t(k)}</div>;
}

function EmptyState({ onPick }: { onPick: () => void }) {
  const t = useT();
  return (
    <div className="empty">
      <button className="dropzone" onClick={onPick}>
        <Icon name="image" size={40} />
        <strong>{t('dropTitle')}</strong>
        <span className="muted">{t('dropSub')}</span>
        <span className="btn primary">{t('choosePhoto')}</span>
        <ol className="steps" aria-label="How it works">
          <li><Icon name="pen" size={16} />{t('step1')}</li>
          <li><Icon name="mic" size={16} />{t('step2')}</li>
          <li><Icon name="export" size={16} />{t('step3')}</li>
        </ol>
      </button>
      <div className="blank-row">
        <span className="muted">{t('blank')}</span>
        {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
          <button key={a} className="chip" onClick={() => void startBlank(a)}><span className={`ratio r${a.replace(':', '-')}`} aria-hidden="true" />{a}</button>
        ))}
      </div>
    </div>
  );
}

const TOOLS: { id: Tool; icon: string; key: string }[] = [
  { id: 'select', icon: 'select', key: 'V' },
  { id: 'pen', icon: 'pen', key: 'M' },
  { id: 'arrow', icon: 'arrow', key: 'A' },
  { id: 'dimension', icon: 'dimension', key: 'D' },
  { id: 'text', icon: 'text', key: 'T' },
  { id: 'eraser', icon: 'eraser', key: 'E' },
];

function Toolbar({ wide }: { wide: boolean }) {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const selected = useStore((s) => s.selected);
  const project = useStore((s) => s.project);
  const el = project?.scene.elements.find((e) => e.uid === selected);
  const mark = project?.scene.marks.find((m) => m.uid === selected);

  if (el) {
    return (
      <div className="toolbar context" role="toolbar" aria-label={el.name}>
        <span className="tb-label" dir="auto">{el.name}</span>
        <button className="tb-btn" onClick={() => flip(el.uid)}>
          <Icon name="flip" />{el.hinge ? `${t('hinge')}: ${t(el.hinge)}` : t('flip')}
        </button>
        {el.sizeCm && (
          <label className="tb-size" title={t('sizeCm')}>
            <input type="number" inputMode="decimal" min={1} value={el.sizeCm[0]} aria-label={`${t('sizeCm')} W`} onChange={(e) => updateElement(el.uid, { sizeCm: [Number(e.target.value) || 0, el.sizeCm![1]] }, false)} />
            ×
            <input type="number" inputMode="decimal" min={1} value={el.sizeCm[1]} aria-label={`${t('sizeCm')} H`} onChange={(e) => updateElement(el.uid, { sizeCm: [el.sizeCm![0], Number(e.target.value) || 0] }, false)} />
            <span>cm</span>
          </label>
        )}
        <button className="tb-btn icon" aria-label={t('duplicate')} title={t('duplicate')} onClick={() => duplicate(el.uid)}><Icon name="copy" /></button>
        <button className="tb-btn icon danger" aria-label={t('delete')} title={t('delete')} onClick={() => removeItem(el.uid)}><Icon name="trash" /></button>
        <button className="tb-btn icon" aria-label={t('close')} onClick={() => set({ selected: null })}><Icon name="check" /></button>
      </div>
    );
  }
  if (mark) {
    return (
      <div className="toolbar context" role="toolbar">
        <button className="tb-btn danger" onClick={() => removeItem(mark.uid)}><Icon name="trash" />{t('delete')}</button>
        <button className="tb-btn icon" aria-label={t('close')} onClick={() => set({ selected: null })}><Icon name="check" /></button>
      </div>
    );
  }
  return (
    <div className="toolbar" role="toolbar" aria-label={t('draw')}>
      {TOOLS.map((x) => (
        <button key={x.id} className={`tb-btn icon${tool === x.id ? ' on' : ''}${x.id === 'pen' ? ' red' : ''}`} aria-pressed={tool === x.id}
          aria-label={t(x.id)} title={wide ? `${t(x.id)} (${x.key})` : t(x.id)} onClick={() => set({ tool: x.id, selected: null, hint: null })}>
          <Icon name={x.icon} />
          {wide && <span className="tb-text">{t(x.id)}</span>}
        </button>
      ))}
      {!wide && <>
        <span className="tb-sep" />
        <button className="tb-btn icon" aria-label={t('undo')} onClick={undo}><Icon name="undo" /></button>
        <button className="tb-btn icon" aria-label={t('redo')} onClick={redo}><Icon name="redo" /></button>
      </>}
    </div>
  );
}

function BottomBar() {
  const t = useT();
  const project = useStore((s) => s.project);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const compare = useStore((s) => s.compare);
  const zoom = useStore((s) => s.zoom);
  const canCompare = !!(project && parentOf(project));
  return (
    <div className="bottombar" role="toolbar">
      <button className="tb-btn icon" aria-label={t('undo')} title={`${t('undo')} (Ctrl+Z)`} disabled={!past.length} onClick={undo}><Icon name="undo" /></button>
      <button className="tb-btn icon" aria-label={t('redo')} title={`${t('redo')} (Ctrl+Shift+Z)`} disabled={!future.length} onClick={redo}><Icon name="redo" /></button>
      <span className="tb-sep" />
      <button className="tb-btn icon" aria-label={t('zoomOut')} onClick={() => board.api?.zoom(1 / 1.25)}><Icon name="minus" /></button>
      <button className="tb-btn zoom" aria-label={t('zoomLabel')} title={t('zoomLabel')} onClick={() => board.api?.fit()}>{Math.round(zoom * 100)}%</button>
      <button className="tb-btn icon" aria-label={t('zoomIn')} onClick={() => board.api?.zoom(1.25)}><Icon name="plus" /></button>
      <span className="tb-sep" />
      <button className={`tb-btn${compare ? ' on' : ''}`} disabled={!canCompare} aria-pressed={compare} onClick={() => set({ compare: !compare })}><Icon name="compare" />{t('compare')}</button>
    </div>
  );
}

function Dock() {
  const t = useT();
  const project = useStore((s) => s.project);
  const busy = useStore((s) => s.busy);
  const [listening, setListening] = useState(false);
  const canCompare = !!(project && parentOf(project));
  const item = (name: SheetName, icon: string, label: Key, disabled = false) => (
    <button className="dock-btn" disabled={disabled} onClick={() => set({ sheet: name })}><Icon name={icon} size={22} /><span>{t(label)}</span></button>
  );
  return (
    <nav className="dock" aria-label={t('menu')}>
      {item('elements', 'grid', 'elements')}
      {canCompare
        ? <button className="dock-btn" onClick={() => set((s) => ({ compare: !s.compare }))}><Icon name="compare" size={22} /><span>{t('compare')}</span></button>
        : item('versions', 'layers', 'versions', !project?.versions.length)}
      <button className={`dock-mic${listening ? ' live' : ''}`} disabled={!!busy} aria-label={listening ? t('listening') : t('hold')} aria-pressed={listening}
        onClick={() => void toggleMic((text) => { set((s) => ({ draft: s.draft ? `${s.draft} ${text}` : text, sheet: 'chat' })); }, setListening)}>
        <Icon name={listening ? 'stop' : 'mic'} size={28} />
      </button>
      {item('chat', 'chat', 'chat')}
      {item('export', 'export', 'export', !project?.current)}
    </nav>
  );
}

/** Phone: the latest assistant line floats above the dock; tap to open the chat. */
function LastReply() {
  const messages = useStore((s) => s.project?.messages);
  const busy = useStore((s) => s.busy);
  const last = messages?.[messages.length - 1];
  if (!busy && (!last || last.role !== 'agent')) return null;
  return (
    <button className="last-reply" onClick={() => set({ sheet: 'chat' })}>
      {busy ? <><span className="dots" aria-hidden="true"><i /><i /><i /></span>{busy.text}</> : <span dir="auto">{last!.text}</span>}
    </button>
  );
}

function Projects() {
  const t = useT();
  const project = useStore((s) => s.project);
  const projects = useStore((s) => s.projects);
  const [name, setName] = useState(project?.name ?? '');
  useEffect(() => { void api.get<ProjectSummary[]>('/api/projects').then((p) => set({ projects: p })); }, []);
  return (
    <div className="projects">
      {project && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) edit(() => ({ name: name.trim().slice(0, 120) }), false); }}>
          <input value={name} dir="auto" aria-label={t('rename')} onChange={(e) => setName(e.target.value)} />
          <button className="btn sm" type="submit">{t('rename')}</button>
        </form>
      )}
      <button className="btn primary" onClick={() => void openProject(newProject(tr(get().lang, 'newProject')))}><Icon name="plus" size={18} />{t('newProject')}</button>
      <ul className="project-list">
        {projects.map((p) => (
          <li key={p.id}>
            <button className={p.id === project?.id ? 'on' : ''} onClick={async () => openProject(await api.get<Project>(`/api/projects/${p.id}`))}>
              {p.thumb ? <img src={fileUrl(p.thumb)} alt="" loading="lazy" /> : <span className="thumb-empty"><Icon name="image" /></span>}
              <span><b dir="auto">{p.name}</b><small className="muted">{new Date(p.updatedAt).toLocaleString()}</small></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useShortcuts() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
      const s = get();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd' && s.selected) { e.preventDefault(); duplicate(s.selected); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected) { e.preventDefault(); removeItem(s.selected); return; }
      if (e.key === 'Escape') { set({ selected: null, pending: null, tool: 'select', compare: false, hint: null, awaiting: null }); return; }
      if (mod || e.altKey || s.sheet) return;
      const tool = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (tool) set({ tool: tool.id, selected: null });
      else if (e.key === '+' || e.key === '=') board.api?.zoom(1.25);
      else if (e.key === '-') board.api?.zoom(1 / 1.25);
      else if (e.key === '0') board.api?.fit();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
}

/** After "Tap where it goes", his next mark re-sends the sentence, so the one question costs one tap. */
function useAwaitingTap() {
  const marks = useStore((s) => s.project?.scene.marks.length ?? 0);
  const prev = useRef(marks);
  useEffect(() => {
    const s = get();
    if (marks > prev.current && s.awaiting) {
      const sentence = s.awaiting;
      set({ awaiting: null, hint: null, tool: 'select' });
      void runTurn(sentence);
    }
    prev.current = marks;
  }, [marks]);
}
