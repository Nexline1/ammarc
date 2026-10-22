// What he hands his boss: the image, or a ready PowerPoint slide (before / after / hazard -> consequence -> solution).
import { useState } from 'react';
import { BRAND, type Lang, type Pitch } from '../../shared/types.ts';
import { api, fileUrl } from '../api.ts';
import { board } from '../canvas/Board.tsx';
import { canvas, forClaude, loadImage } from '../canvas/raster.ts';
import { tr, useT } from '../i18n.ts';
import { toast, useStore } from '../store.ts';
import { Icon } from '../ui/Icon.tsx';
import { rootOf } from './Versions.tsx';

type Crop = 'original' | '1:1' | '3:4';

function crop(src: HTMLCanvasElement, c: Crop): HTMLCanvasElement {
  if (c === 'original') return src;
  const r = c === '1:1' ? 1 : 3 / 4;
  let w = src.width, h = w / r;
  if (h > src.height) { h = src.height; w = h * r; }
  const out = canvas(Math.round(w), Math.round(h));
  out.getContext('2d')!.drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, out.width, out.height);
  return out;
}

const fileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || BRAND.name;

function save(blob: Blob, name: string) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function ExportSheet() {
  const t = useT();
  const project = useStore((s) => s.project);
  const uiLang = useStore((s) => s.lang);
  const [aspect, setAspect] = useState<Crop>('original');
  const [lang, setLang] = useState<Lang>(uiLang);
  const [pitch, setPitch] = useState<Pitch>({ title: project?.name ?? '', hazard: '', consequence: '', solution: '' });
  const [drafting, setDrafting] = useState(false);
  if (!project?.current) return <p className="muted pad">{t('dropTitle')}</p>;

  const after = () => board.api?.exportCanvas({ marks: 'annotations' }) ?? null;

  const png = () => {
    const c = after();
    if (!c) return;
    crop(c, aspect).toBlob((b) => b && save(b, `${fileName(project.name)}.png`), 'image/png');
  };

  const draft = async () => {
    setDrafting(true);
    try {
      const root = rootOf(project);
      const before = root ? forClaude(await loadImage(fileUrl(root.file))) : null;
      const a = after();
      const history = project.messages.slice(-20).map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
      setPitch(await api.post<Pitch>('/api/pitch', { lang, history, before, after: a ? forClaude(a) : null }));
    } catch (e) { toast((e as Error).message); } finally { setDrafting(false); }
  };

  const pptx = async () => {
    const a = after();
    if (!a) return;
    const root = rootOf(project);
    const beforeImg = root ? await loadImage(fileUrl(root.file)) : null;
    const before = beforeImg ? { url: canvasUrl(beforeImg), w: beforeImg.naturalWidth, h: beforeImg.naturalHeight } : { url: a.toDataURL('image/png'), w: a.width, h: a.height };
    const { default: PptxGenJS } = await import('pptxgenjs');
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
    const ar = lang === 'ar';
    const font = ar ? 'Arial' : 'Calibri';
    const align = ar ? 'right' : 'left';
    const s = pres.addSlide();
    s.background = { color: 'FFFFFF' };
    s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: 'CF5A1E' }, line: { color: 'CF5A1E' } });
    s.addText(pitch.title || project.name, { x: 0.6, y: 0.35, w: 12.13, h: 0.8, fontFace: font, fontSize: 28, bold: true, color: '16191D', align, rtlMode: ar });
    // Fit each picture into its 5.9 x 3.3 in box by its own aspect ratio (pptx "contain" can't see the real pixels).
    const img = (pic: { url: string; w: number; h: number }, x: number, label: string) => {
      s.addText(label, { x, y: 1.25, w: 5.9, h: 0.35, fontFace: font, fontSize: 13, bold: true, color: '5B636E', align, rtlMode: ar });
      const r = pic.w / pic.h;
      const [w, h] = r > 5.9 / 3.3 ? [5.9, 5.9 / r] : [3.3 * r, 3.3];
      s.addImage({ data: pic.url.replace(/^data:/, ''), x: x + (5.9 - w) / 2, y: 1.65 + (3.3 - h) / 2, w, h });
    };
    const [x1, x2] = ar ? [6.83, 0.6] : [0.6, 6.83];
    img(before, x1, tr(lang, 'before'));
    img({ url: a.toDataURL('image/png'), w: a.width, h: a.height }, x2, tr(lang, 'after'));
    const cols: [string, string, string][] = [['hazard', pitch.hazard, 'D63B2F'], ['consequence', pitch.consequence, 'B5880A'], ['solution', pitch.solution, '2E8B57']];
    (ar ? [...cols].reverse() : cols).forEach(([k, body, color], i) => {
      const x = 0.6 + i * 4.08;
      s.addShape('rect', { x, y: 5.25, w: 3.92, h: 1.55, fill: { color: 'F6F7F9' }, line: { color: 'E4E7EB' } });
      s.addShape('rect', { x, y: 5.25, w: 3.92, h: 0.06, fill: { color }, line: { color } });
      s.addText([
        { text: tr(lang, k as 'hazard'), options: { bold: true, fontSize: 13, color, breakLine: true } },
        { text: body || '—', options: { fontSize: 12, color: '16191D' } },
      ], { x: x + 0.12, y: 5.36, w: 3.68, h: 1.38, fontFace: font, valign: 'top', align, rtlMode: ar });
    });
    s.addText(`${tr(lang, 'concept')} · ${BRAND.name}`, { x: 0.6, y: 6.95, w: 12.13, h: 0.35, fontFace: font, fontSize: 10, color: '8E97A1', align, rtlMode: ar });
    await pres.writeFile({ fileName: `${fileName(pitch.title || project.name)}.pptx` });
  };

  const field = (k: keyof Pitch, rows = 2) => (
    <label className="field">
      <span>{tr(lang, k)}</span>
      <textarea rows={rows} dir="auto" value={pitch[k]} onChange={(e) => setPitch({ ...pitch, [k]: e.target.value })} />
    </label>
  );

  return (
    <div className="export">
      <section className="card">
        <header><Icon name="image" /><div><h3>{t('exportPng')}</h3><p className="muted">{t('exportPngSub')}</p></div></header>
        <div className="seg sm">
          {(['original', '1:1', '3:4'] as Crop[]).map((c) => <button key={c} className={aspect === c ? 'on' : ''} onClick={() => setAspect(c)}>{c === 'original' ? t('original') : c}</button>)}
        </div>
        <button className="btn primary" onClick={png}><Icon name="export" size={18} />{t('download')}</button>
      </section>
      <section className="card">
        <header><Icon name="layers" /><div><h3>{t('pitch')}</h3><p className="muted">{t('pitchSub')}</p></div></header>
        <div className="row between">
          <div className="seg sm" aria-label={t('language')}>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
            <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>العربية</button>
          </div>
          <button className="btn sm" onClick={() => void draft()} disabled={drafting}><Icon name="spark" size={16} />{drafting ? t('drafting') : t('draft')}</button>
        </div>
        <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {field('title', 1)}
          {field('hazard')}
          {field('consequence')}
          {field('solution')}
        </div>
        <button className="btn primary" onClick={() => void pptx().catch((e) => toast((e as Error).message))}><Icon name="export" size={18} />{t('download')} .pptx</button>
        <p className="muted small">{tr(lang, 'concept')}</p>
      </section>
    </div>
  );
}

function canvasUrl(img: HTMLImageElement) {
  const c = canvas(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}
