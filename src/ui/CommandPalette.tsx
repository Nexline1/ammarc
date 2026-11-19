// Cmd/Ctrl+K: one box to reach any element, tool, idea or action without hunting through panels.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../../shared/types.ts';
import { api } from '../api.ts';
import { addCatalog } from '../actions.ts';
import { board } from '../canvas/Board.tsx';
import { elementUrl, ITEMS, norm } from '../elements/catalog.ts';
import { tr, useT, type Key } from '../i18n.ts';
import { newProject, openProject, redo, set, setLang, undo, useStore, type ProjectSummary, type Tool } from '../store.ts';
import { Icon } from './Icon.tsx';

type Item = { id: string; group: Key; label: string; hint?: string; icon?: string; img?: string; run: () => void };

const TOOLS: [Tool, string][] = [['select', 'select'], ['pen', 'pen'], ['arrow', 'arrow'], ['dimension', 'dimension'], ['text', 'text'], ['eraser', 'eraser']];

export function CommandPalette({ onPhoto }: { onPhoto: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const hasImage = useStore((s) => !!s.project?.current);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const [ideas, setIdeas] = useState<ProjectSummary[]>([]);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => { void api.get<ProjectSummary[]>('/api/projects').then(setIdeas).catch(() => undefined); }, []);
  const close = () => set({ palette: false });

  const items = useMemo<Item[]>(() => {
    const L = (k: Key) => tr(lang, k);
    const actions: Item[] = [
      { id: 'a-photo', group: 'groupActions', label: L('uploadPhoto'), icon: 'image', run: onPhoto },
      { id: 'a-new', group: 'groupActions', label: L('newProject'), icon: 'plus', run: () => void openProject(newProject(L('newProject'))) },
      ...(hasImage ? [
        { id: 'a-export', group: 'groupActions' as Key, label: L('export'), icon: 'export', run: () => set({ sheet: 'export' }) },
        { id: 'a-compare', group: 'groupActions' as Key, label: L('compare'), icon: 'compare', run: () => set({ compare: true }) },
        { id: 'a-fit', group: 'groupActions' as Key, label: L('fit'), icon: 'fit', run: () => board.api?.fit() },
      ] : []),
      { id: 'a-undo', group: 'groupActions', label: L('undo'), hint: 'Ctrl Z', icon: 'undo', run: undo },
      { id: 'a-redo', group: 'groupActions', label: L('redo'), hint: 'Ctrl ⇧ Z', icon: 'redo', run: redo },
      { id: 'a-memory', group: 'groupActions', label: L('memory'), icon: 'book', run: () => set({ sheet: 'memory' }) },
      { id: 'a-lang', group: 'groupActions', label: lang === 'en' ? 'العربية' : 'English', icon: 'globe', run: () => setLang(lang === 'en' ? 'ar' : 'en') },
    ];
    const tools: Item[] = hasImage ? TOOLS.map(([tool, icon]) => ({ id: `t-${tool}`, group: 'groupTools', label: L(tool as Key), icon, run: () => set({ tool, selected: null }) })) : [];
    const els: Item[] = ITEMS.map((i) => ({ id: `e-${i.id}`, group: 'groupElements', label: lang === 'ar' ? i.ar : i.en, hint: i.size ? `${i.size[0]}×${i.size[1]} cm` : undefined, img: elementUrl(i.id), run: () => void addCatalog(i) }));
    const ids: Item[] = ideas.map((p) => ({ id: `i-${p.id}`, group: 'groupIdeas', label: p.name, icon: 'layers', run: () => void api.get<Project>(`/api/projects/${p.id}`).then(openProject) }));
    return [...actions, ...tools, ...ids, ...els];
  }, [lang, hasImage, ideas, onPhoto]);

  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const hay = (i: Item) => norm(`${i.label} ${i.hint ?? ''} ${i.id}`);
    const syn = (i: Item) => (i.group === 'groupElements' ? norm(ITEMS.find((x) => `e-${x.id}` === i.id)!.syn.join(' ')) : '');
    const hits = words.length ? items.filter((i) => words.every((w) => hay(i).includes(w) || syn(i).includes(w))) : items.filter((i) => i.group !== 'groupElements').concat(items.filter((i) => i.group === 'groupElements').slice(0, 8));
    return hits.slice(0, 40);
  }, [items, q]);
  useEffect(() => setAt(0), [q]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [at]);

  const pick = (i: Item | undefined) => { if (!i) return; close(); i.run(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[at]); }
    else if (e.key === 'Escape') close();
  };

  let lastGroup: Key | null = null;
  return (
    <div className="palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('searchAll')} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <label className="palette-input">
          <Icon name="search" size={20} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={t('paletteHint')} aria-label={t('paletteHint')}
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={shown[at] ? `pi-${shown[at].id}` : undefined} />
          <kbd>Esc</kbd>
        </label>
        <ul className="palette-list" id="palette-list" role="listbox" ref={list}>
          {shown.length === 0 && <li className="palette-empty">{t('nothingFound')}</li>}
          {shown.map((i, n) => {
            const head = i.group !== lastGroup ? (lastGroup = i.group) : null;
            return (
              <li key={i.id} role="presentation">
                {head && <div className="palette-group">{t(head)}</div>}
                <button id={`pi-${i.id}`} role="option" aria-selected={n === at} className={n === at ? 'on' : ''} onMouseMove={() => setAt(n)} onClick={() => pick(i)}>
                  {i.img ? <img src={i.img} alt="" /> : <span className="palette-icon"><Icon name={i.icon ?? 'spark'} size={18} /></span>}
                  <span className="palette-label" dir="auto">{i.label}</span>
                  {i.hint && <span className="palette-hint">{i.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
