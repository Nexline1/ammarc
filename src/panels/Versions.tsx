// Every render is a version. Filmstrip to jump back; before/after slider for the pitch moment.
import { useRef, useState } from 'react';
import type { Project } from '../../shared/types.ts';
import { fileUrl } from '../api.ts';
import { useT } from '../i18n.ts';
import { edit, get, set, useStore } from '../store.ts';
import { Icon } from '../ui/Icon.tsx';

export const parentOf = (p: Project) => {
  const cur = p.versions.find((v) => v.id === p.current);
  return cur?.parent ? p.versions.find((v) => v.id === cur.parent) ?? null : null;
};
export const rootOf = (p: Project) => {
  let v = p.versions.find((x) => x.id === p.current) ?? null;
  while (v?.parent) v = p.versions.find((x) => x.id === v!.parent) ?? null;
  return v;
};

/** Newest first; each step shows the sentence that made it, so he can find "the one with the door" at a glance. */
export function Versions({ onPick }: { onPick?: () => void }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const busy = useStore((s) => !!s.busy);
  if (!project?.versions.length) return <p className="muted pad">{t('noVersions')}</p>;
  const label = (note: string) => (note === 'photo' ? t('originalPhoto') : note === 'blank' ? t('blankBoard') : note);
  return (
    <ol className="version-list" aria-label={t('versions')}>
      {project.versions.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => {
        const on = v.id === project.current;
        return (
          <li key={v.id}>
            <button
              className={on ? 'on' : ''}
              aria-current={on || undefined}
              disabled={busy}
              onClick={() => { if (!on && !get().busy) edit(() => ({ current: v.id })); onPick?.(); }}
            >
              <img src={fileUrl(v.file)} alt="" loading="lazy" draggable={false} />
              <span className="v-meta">
                <span className="v-step">{i + 1}{on && <em>{t('current')}</em>}</span>
                <span className="v-note" dir="auto">{label(v.note)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Compare() {
  const t = useT();
  const project = useStore((s) => s.project);
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  if (!project) return null;
  const after = project.versions.find((v) => v.id === project.current);
  const before = parentOf(project);
  if (!after || !before) return null;
  const drag = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };
  return (
    <div className="compare" ref={ref}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return; // capturing would swallow the Close tap
        e.currentTarget.setPointerCapture(e.pointerId);
        drag(e);
      }}
      onPointerMove={(e) => e.buttons && drag(e)}>
      <img src={fileUrl(before.file)} alt={t('before')} draggable={false} />
      <img src={fileUrl(after.file)} alt={t('after')} draggable={false} style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
      <div className="divider" style={{ left: `${pos}%` }} role="slider" aria-label={t('compare')} aria-valuenow={Math.round(pos)} aria-valuemin={0} aria-valuemax={100} tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5)); if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5)); }}>
        <span className="knob" />
      </div>
      <span className="tag l">{t('before')}</span>
      <span className="tag r">{t('after')}</span>
      <button className="icon-btn close-compare" aria-label={t('close')} onClick={() => set({ compare: false })}><Icon name="close" /></button>
    </div>
  );
}
