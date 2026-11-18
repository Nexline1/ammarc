// What he hands his boss: the image, a pitch slide, a deck of several ideas, an email, or a printable PDF page.
import { useEffect, useState } from 'react';
import { BRAND, type Email, type Lang, type Pitch, type Project } from '../../shared/types.ts';
import { api, fileUrl } from '../api.ts';
import { board } from '../canvas/Board.tsx';
import { canvas, forClaude, loadImage } from '../canvas/raster.ts';
import { tr, useT } from '../i18n.ts';
import { edit, toast, useStore, type ProjectSummary } from '../store.ts';
import { Icon } from '../ui/Icon.tsx';
import { deckPlan, fitBox, type Idea, type Pic } from './deck.ts';
import { rootOf } from './Versions.tsx';

type Crop = 'original' | '1:1' | '3:4';
type Pres = InstanceType<typeof import('pptxgenjs').default>;
const EMPTY = (title: string): Pitch => ({ title, hazard: '', consequence: '', solution: '' });

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

const pic = (c: HTMLCanvasElement): Pic => ({ url: c.toDataURL('image/png'), w: c.width, h: c.height });
async function picOf(file: string): Promise<Pic> {
  const img = await loadImage(fileUrl(file));
  const c = canvas(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return pic(c);
}

/** The open idea: after = the board with his dimension lines and notes. */
async function liveIdea(project: Project, pitch: Pitch): Promise<Idea | null> {
  const a = board.api?.exportCanvas({ marks: 'annotations' });
  if (!a) return null;
  const root = rootOf(project);
  return { id: project.id, name: project.name, pitch, before: root ? await picOf(root.file) : pic(a), after: pic(a) };
}
/** Another saved idea: its original photo and its current version. */
async function savedIdea(id: string): Promise<Idea | null> {
  const p = await api.get<Project>(`/api/projects/${id}`);
  const cur = p.versions.find((v) => v.id === p.current);
  if (!cur) return null;
  const root = rootOf(p) ?? cur;
  return { id, name: p.name, pitch: p.pitch ?? null, before: await picOf(root.file), after: await picOf(cur.file) };
}

// ---------- slides ----------
function ideaSlide(pres: Pres, idea: Idea, lang: Lang) {
  const ar = lang === 'ar', font = ar ? 'Arial' : 'Calibri', align = ar ? 'right' : 'left';
  const pitch = idea.pitch ?? EMPTY(idea.name);
  const s = pres.addSlide();
  s.background = { color: 'FFFFFF' };
  s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: 'CF5A1E' }, line: { color: 'CF5A1E' } });
  s.addText(pitch.title || idea.name, { x: 0.6, y: 0.35, w: 12.13, h: 0.8, fontFace: font, fontSize: 28, bold: true, color: '16191D', align, rtlMode: ar });
  const img = (p: Pic, x: number, label: string) => {
    s.addText(label, { x, y: 1.25, w: 5.9, h: 0.35, fontFace: font, fontSize: 13, bold: true, color: '5B636E', align, rtlMode: ar });
    const f = fitBox(p, 5.9, 3.3);
    s.addImage({ data: p.url.replace(/^data:/, ''), x: x + f.dx, y: 1.65 + f.dy, w: f.w, h: f.h });
  };
  const [x1, x2] = ar ? [6.83, 0.6] : [0.6, 6.83];
  img(idea.before, x1, tr(lang, 'before'));
  img(idea.after, x2, tr(lang, 'after'));
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
}

async function buildDeck(ideas: Idea[], lang: Lang, name: string) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  const ar = lang === 'ar', font = ar ? 'Arial' : 'Calibri', align = ar ? 'right' : 'left';
  for (const slide of deckPlan(ideas)) {
    if (slide.kind === 'idea') { ideaSlide(pres, slide.idea, lang); continue; }
    const s = pres.addSlide();
    s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: 'CF5A1E' }, line: { color: 'CF5A1E' } });
    if (slide.kind === 'cover') {
      s.background = { color: '16191D' };
      s.addText(tr(lang, 'deckTitle'), { x: 0.8, y: 2.6, w: 11.7, h: 1.2, fontFace: font, fontSize: 40, bold: true, color: 'FFFFFF', align, rtlMode: ar });
      s.addText(`${slide.count} · ${new Date().toLocaleDateString(ar ? 'ar-BH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, { x: 0.8, y: 3.8, w: 11.7, h: 0.6, fontFace: font, fontSize: 18, color: 'EE9B66', align, rtlMode: ar });
      s.addText(`${tr(lang, 'concept')} · ${BRAND.name}`, { x: 0.8, y: 6.8, w: 11.7, h: 0.35, fontFace: font, fontSize: 10, color: '8E97A1', align, rtlMode: ar });
    } else {
      s.addText(tr(lang, 'summary'), { x: 0.6, y: 0.35, w: 12.13, h: 0.8, fontFace: font, fontSize: 28, bold: true, color: '16191D', align, rtlMode: ar });
      const head = ['#', tr(lang, 'idea'), tr(lang, 'hazard'), tr(lang, 'consequence'), tr(lang, 'solution')];
      const rows = slide.rows.map((r) => [String(r.n), r.title, r.pitch?.hazard || '—', r.pitch?.consequence || '—', r.pitch?.solution || '—']);
      const table = [head, ...rows].map((row) => (ar ? [...row].reverse() : row).map((text) => ({ text })));
      s.addTable(table, { x: 0.6, y: 1.3, w: 12.13, colW: ar ? [3.2, 3, 3, 2.33, 0.6] : [0.6, 2.33, 3, 3, 3.2], fontFace: font, fontSize: 11, color: '16191D', border: { type: 'solid', pt: 0.75, color: 'E4E7EB' }, fill: { color: 'FFFFFF' }, align, valign: 'top' });
    }
  }
  await pres.writeFile({ fileName: `${fileName(name)}.pptx` });
}

function printPage(idea: Idea, lang: Lang) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print.'); return; }
  const p = idea.pitch ?? EMPTY(idea.name);
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  w.document.write(`<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(p.title || idea.name)}</title>
<style>@page{size:A4 landscape;margin:14mm}body{font:13px/1.5 system-ui,'Segoe UI',Arial,sans-serif;color:#16191d;margin:0}
h1{font-size:24px;margin:0 0 12px;border-top:4px solid #cf5a1e;padding-top:10px}.pics{display:grid;grid-template-columns:1fr 1fr;gap:14px}
figure{margin:0}figcaption{font-weight:700;color:#5b636e;margin-bottom:4px}img{width:100%;max-height:300px;object-fit:contain;background:#f5f6f8}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}.cols div{background:#f6f7f9;padding:10px;border-top:3px solid}
b{display:block;margin-bottom:4px}footer{margin-top:14px;color:#8e97a1;font-size:11px}</style></head><body>
<h1>${esc(p.title || idea.name)}</h1>
<div class="pics"><figure><figcaption>${tr(lang, 'before')}</figcaption><img src="${idea.before.url}"></figure><figure><figcaption>${tr(lang, 'after')}</figcaption><img src="${idea.after.url}"></figure></div>
<div class="cols"><div style="border-color:#d63b2f"><b>${tr(lang, 'hazard')}</b>${esc(p.hazard || '—')}</div><div style="border-color:#b5880a"><b>${tr(lang, 'consequence')}</b>${esc(p.consequence || '—')}</div><div style="border-color:#2e8b57"><b>${tr(lang, 'solution')}</b>${esc(p.solution || '—')}</div></div>
<footer>${tr(lang, 'concept')} · ${BRAND.name}</footer><script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}

export function ExportSheet() {
  const t = useT();
  const project = useStore((s) => s.project);
  const uiLang = useStore((s) => s.lang);
  const [aspect, setAspect] = useState<Crop>('original');
  const [lang, setLang] = useState<Lang>(uiLang);
  const [pitch, setPitchState] = useState<Pitch>(project?.pitch ?? EMPTY(project?.name ?? ''));
  const [ideas, setIdeas] = useState<ProjectSummary[]>([]);
  const [picked, setPicked] = useState<string[]>(project ? [project.id] : []);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState<Email | null>(null);
  useEffect(() => { void api.get<ProjectSummary[]>('/api/projects').then((all) => setIdeas(all.filter((p) => p.thumb))); }, []);
  if (!project?.current) return <p className="muted pad">{t('dropTitle')}</p>;

  // The pitch is kept with the idea, so the deck and email can reuse it later.
  const setPitch = (p: Pitch) => { setPitchState(p); edit(() => ({ pitch: p }), false); };
  const run = (key: string, fn: () => Promise<void>) => async () => {
    setBusy(key);
    try { await fn(); } catch (e) { toast((e as Error).message); } finally { setBusy(null); }
  };
  const after = () => board.api?.exportCanvas({ marks: 'annotations' }) ?? null;
  const pickedIdeas = async () => {
    const out: Idea[] = [];
    for (const id of picked) {
      const idea = id === project.id ? await liveIdea(project, pitch) : await savedIdea(id);
      if (idea) out.push(idea);
    }
    return out;
  };

  const png = () => {
    const c = after();
    if (c) crop(c, aspect).toBlob((b) => b && save(b, `${fileName(project.name)}.png`), 'image/png');
  };
  const draft = run('pitch', async () => {
    const root = rootOf(project);
    const before = root ? forClaude(await loadImage(fileUrl(root.file))) : null;
    const a = after();
    const history = project.messages.slice(-20).map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
    setPitch(await api.post<Pitch>('/api/pitch', { lang, history, before, after: a ? forClaude(a) : null }));
  });
  const slide = run('pptx', async () => { const i = await liveIdea(project, pitch); if (i) await buildDeck([i], lang, pitch.title || project.name); });
  const deck = run('deck', async () => buildDeck(await pickedIdeas(), lang, tr(lang, 'deckTitle')));
  const draftEmail = run('email', async () => {
    const list = await pickedIdeas();
    const pitches = list.map((i) => i.pitch ?? EMPTY(i.name));
    setEmail(await api.post<Email>('/api/email', { lang, pitches: pitches.length ? pitches : [pitch] }));
  });
  const pdf = run('pdf', async () => { const i = await liveIdea(project, pitch); if (i) printPage(i, lang); });

  const field = (k: keyof Pitch, rows = 2) => (
    <label className="field">
      <span>{tr(lang, k)}</span>
      <textarea rows={rows} dir="auto" value={pitch[k]} onChange={(e) => setPitch({ ...pitch, [k]: e.target.value })} />
    </label>
  );

  return (
    <div className="export">
      <div className="row between">
        <span className="muted small">{t('language')}</span>
        <div className="seg sm" aria-label={t('language')}>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>العربية</button>
        </div>
      </div>
      <section className="card">
        <header><Icon name="image" /><div><h3>{t('exportPng')}</h3><p className="muted">{t('exportPngSub')}</p></div></header>
        <div className="seg sm">
          {(['original', '1:1', '3:4'] as Crop[]).map((c) => <button key={c} className={aspect === c ? 'on' : ''} onClick={() => setAspect(c)}>{c === 'original' ? t('original') : c}</button>)}
        </div>
        <button className="btn primary" onClick={png}><Icon name="export" size={18} />{t('download')}</button>
      </section>
      <section className="card">
        <header><Icon name="layers" /><div><h3>{t('pitch')}</h3><p className="muted">{t('pitchSub')}</p></div></header>
        <button className="btn sm" onClick={() => void draft()} disabled={!!busy}><Icon name="spark" size={16} />{busy === 'pitch' ? t('drafting') : t('draft')}</button>
        <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {field('title', 1)}
          {field('hazard')}
          {field('consequence')}
          {field('solution')}
        </div>
        <div className="row">
          <button className="btn primary" disabled={!!busy} onClick={() => void slide()}><Icon name="export" size={18} />{t('download')} .pptx</button>
          <button className="btn" disabled={!!busy} onClick={() => void pdf()} title={t('pdfSub')}><Icon name="image" size={18} />{t('pdf')}</button>
        </div>
        <p className="muted small">{tr(lang, 'concept')}</p>
      </section>
      <section className="card">
        <header><Icon name="grid" /><div><h3>{t('deck')}</h3><p className="muted">{t('deckSub')}</p></div></header>
        <p className="small muted" style={{ margin: 0 }}>{t('deckPick')}</p>
        <ul className="idea-pick">
          {ideas.map((p) => (
            <li key={p.id}>
              <label>
                <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
                <img src={fileUrl(p.thumb!)} alt="" loading="lazy" />
                <span dir="auto">{p.id === project.id ? project.name : p.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <button className="btn primary" disabled={!picked.length || !!busy} onClick={() => void deck()}><Icon name="export" size={18} />{busy === 'deck' ? '…' : `${t('download')} .pptx (${picked.length})`}</button>
      </section>
      <section className="card">
        <header><Icon name="send" /><div><h3>{t('email')}</h3><p className="muted">{t('emailSub')}</p></div></header>
        <button className="btn sm" disabled={!!busy} onClick={() => void draftEmail()}><Icon name="spark" size={16} />{busy === 'email' ? t('drafting') : t('draftEmail')}</button>
        {email && (
          <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <label className="field"><span>{t('subject')}</span><input value={email.subject} dir="auto" onChange={(e) => setEmail({ ...email, subject: e.target.value })} /></label>
            <label className="field"><span>{t('body')}</span><textarea rows={8} dir="auto" value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} /></label>
            <div className="row">
              <button className="btn" onClick={() => void navigator.clipboard.writeText(`${email.subject}\n\n${email.body}`).then(() => toast(t('copied')))}><Icon name="copy" size={18} />{t('copy')}</button>
              <a className="btn" href={`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}><Icon name="send" size={18} />{t('openMail')}</a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
