// Left panel: drawn industrial elements (a row per category, "See all" opens its page) and his own parts.
import { useMemo, useState } from 'react';
import { api, fileUrl } from '../api.ts';
import { addCatalog, addPart } from '../actions.ts';
import { board } from '../canvas/Board.tsx';
import { CATEGORIES, elementUrl, ITEMS, search, type CatalogItem } from '../elements/catalog.ts';
import { useT } from '../i18n.ts';
import { set, toast, useStore, type Part } from '../store.ts';
import { Icon } from '../ui/Icon.tsx';

/** Pointer drag from a tile to the board. Mouse: drag after 6px. Touch: long-press, so the list still scrolls. Tap: add at centre. */
function startDrag(e: React.PointerEvent<HTMLElement>, src: string, drop: (at: [number, number] | null) => void, compact: boolean) {
  if (e.button !== 0) return;
  const touch = e.pointerType !== 'mouse';
  const tile = e.currentTarget;
  const r = tile.getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY;
  const off = { x: sx - r.left, y: sy - r.top };
  let ghost: HTMLImageElement | null = null;
  let moved = false;
  let last = { x: sx, y: sy };
  const begin = () => {
    ghost = Object.assign(document.createElement('img'), { src, className: 'drag-ghost', alt: '' });
    ghost.style.width = `${r.width}px`;
    ghost.style.transform = `translate(${last.x - off.x}px, ${last.y - off.y}px) scale(1.06)`;
    document.body.append(ghost);
    navigator.vibrate?.(8);
    // Hide (don't unmount) the phone sheet: unmounting the tile would cut the touch stream mid-drag.
    set({ dragging: true });
  };
  const timer = touch ? window.setTimeout(begin, 260) : 0;
  const move = (ev: PointerEvent) => {
    last = { x: ev.clientX, y: ev.clientY };
    const d = Math.hypot(ev.clientX - sx, ev.clientY - sy);
    if (!ghost) {
      if (d > 6) moved = true;
      if (!touch && d > 6) begin();
      else if (touch && d > 10) cleanup(); // he is scrolling the list or a row
      return;
    }
    ghost.style.transform = `translate(${ev.clientX - off.x}px, ${ev.clientY - off.y}px) scale(1.06)`;
  };
  const up = (ev: PointerEvent) => {
    const g = ghost as HTMLImageElement | null;
    cleanup();
    if (!g) { if (!moved) drop(null); return; }
    // The ghost's centre is where the element lands (respects where he grabbed it).
    const at = board.api?.worldFromClient(ev.clientX - off.x + r.width / 2, ev.clientY - off.y + r.height / 2) ?? null;
    if (at) { g.remove(); drop(at); return; }
    const back = g.animate([{ transform: g.style.transform }, { transform: `translate(${r.left}px, ${r.top}px) scale(1)`, opacity: 0.2 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    back.onfinish = () => g.remove();
  };
  const noScroll = (ev: TouchEvent) => { if (ghost) ev.preventDefault(); };
  const cancel = () => { ghost?.remove(); cleanup(); };
  function cleanup() {
    clearTimeout(timer);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('touchmove', noScroll);
    if (ghost) set({ dragging: false, ...(compact ? { sheet: null } : {}) });
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('touchmove', noScroll, { passive: false });
}

const ROW = 8; // tiles shown per category on the home page

/** Phone sheet: Elements and My parts share one sheet with a switch. Laptop: the rail picks the page. */
export function Library({ compact, tab: forced }: { compact: boolean; tab?: 'elements' | 'parts' }) {
  const t = useT();
  const [own, setOwn] = useState<'elements' | 'parts'>('elements');
  const tab = forced ?? own;
  return (
    <div className="library">
      {!forced && (
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'elements'} className={tab === 'elements' ? 'on' : ''} onClick={() => setOwn('elements')}>{t('elements')}</button>
          <button role="tab" aria-selected={tab === 'parts'} className={tab === 'parts' ? 'on' : ''} onClick={() => setOwn('parts')}>{t('myParts')}</button>
        </div>
      )}
      {tab === 'elements' ? <Elements compact={compact} /> : <Parts compact={compact} />}
    </div>
  );
}

function Elements({ compact }: { compact: boolean }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const results = useMemo(() => search(q), [q]);
  const label = (x: { en: string; ar: string }) => (lang === 'ar' ? x.ar : x.en);
  const after = () => compact && set({ sheet: null });

  const tile = (i: CatalogItem) => (
    <button
      key={i.id}
      className="tile"
      title={label(i)}
      onPointerDown={(e) => startDrag(e, elementUrl(i.id), (at) => { void addCatalog(i, at); after(); }, compact)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void addCatalog(i); } }}
    >
      <img src={elementUrl(i.id)} alt="" draggable={false} loading="lazy" />
      <span dir="auto">{label(i)}</span>
    </button>
  );
  const page = cat ? CATEGORIES.find((c) => c.id === cat)! : null;

  return (
    <div className="lib-body" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <label className="search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => { setQ(e.target.value); setCat(null); }} placeholder={t('search')} aria-label={t('search')} dir="auto" />
        {q && <button className="icon-btn sm" aria-label={t('close')} onClick={() => setQ('')}><Icon name="close" size={16} /></button>}
      </label>
      <div className="tiles-scroll">
        {q ? (
          results.length ? <div className="tiles">{results.map(tile)}</div> : <p className="muted pad">{t('noResults')}</p>
        ) : page ? (
          <section className="cat-page">
            <button className="back" onClick={() => setCat(null)}><Icon name="chevron" size={18} /><span>{label(page)}</span></button>
            <div className="tiles">{ITEMS.filter((i) => i.cat === page.id).map(tile)}</div>
          </section>
        ) : (
          CATEGORIES.map((c) => {
            const items = ITEMS.filter((i) => i.cat === c.id);
            return (
              <section key={c.id} className="cat">
                <header>
                  <h3>{label(c)}</h3>
                  <button className="see-all" onClick={() => setCat(c.id)} aria-label={`${t('seeAll')}: ${label(c)}`}>{t('seeAll')} <b>{items.length}</b></button>
                </header>
                <div className="row-scroll">{items.slice(0, ROW).map(tile)}</div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function Parts({ compact }: { compact: boolean }) {
  const t = useT();
  const parts = useStore((s) => s.parts);
  const after = () => compact && set({ sheet: null });
  return (
    <div className="lib-body">
      <div className="part-actions">
        <button className="action-card" onClick={() => { set({ tool: 'lasso', selected: null, hint: t('hintLasso') }); after(); }}>
          <Icon name="lasso" size={22} /><b>{t('cutFromPhoto')}</b><span>{t('cutSub')}</span>
        </button>
        <button className="action-card" onClick={() => set({ draft: t('makePartPrompt'), sheet: compact ? 'chat' : null })}>
          <Icon name="spark" size={22} /><b>{t('makePart')}</b><span>{t('makeSub')}</span>
        </button>
      </div>
      <div className="tiles-scroll">
        {parts.length ? (
          <div className="tiles">
            {parts.map((p) => (
              <div key={p.file} className="tile-wrap">
                <button className="tile" title={p.name} onPointerDown={(e) => startDrag(e, fileUrl(p.file), (at) => { void addPart(p, at); after(); }, compact)}>
                  <img src={fileUrl(p.file)} alt="" draggable={false} loading="lazy" />
                  <span dir="auto">{p.name}</span>
                </button>
                <button className="tile-x" aria-label={`${t('delete')} ${p.name}`} onClick={() => removePart(p)}><Icon name="close" size={14} /></button>
              </div>
            ))}
          </div>
        ) : <p className="muted pad">{t('noParts')}</p>}
      </div>
    </div>
  );
}

async function removePart(p: Part) {
  set((s) => ({ parts: s.parts.filter((x) => x.file !== p.file) }));
  await api.del(`/api/parts/${p.file}`).catch((e) => toast((e as Error).message));
}
