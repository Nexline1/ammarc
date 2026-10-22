// Right panel: one sentence in (typed or spoken), short answers and one-tap chips out.
import { useEffect, useRef, useState } from 'react';
import type { Memory } from '../../shared/types.ts';
import { api } from '../api.ts';
import { tr, useT } from '../i18n.ts';
import { edit, get, set, toast, uid, useStore } from '../store.ts';
import { runTurn } from '../turn.ts';
import { Icon } from '../ui/Icon.tsx';

// ---------- voice ----------
let rec: MediaRecorder | null = null;
export async function toggleMic(onText: (t: string) => void, onState: (on: boolean) => void) {
  if (rec) { rec.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia) { toast('Voice needs HTTPS or localhost.'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = rec?.mimeType || 'audio/webm';
      rec = null;
      onState(false);
      const blob = new Blob(chunks, { type });
      if (blob.size < 800) return;
      set({ busy: { stage: 'thinking', text: '…' } });
      try {
        const res = await fetch(`/api/transcribe?lang=${get().lang}`, { method: 'POST', headers: { 'Content-Type': type.split(';')[0] }, body: blob });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Transcription failed');
        onText(data.text);
      } catch (e) { toast((e as Error).message); } finally { set({ busy: null }); }
    };
    rec.start();
    onState(true);
  } catch {
    rec = null;
    toast('Microphone not available.');
  }
}

export function Composer({ autoFocus }: { autoFocus?: boolean }) {
  const t = useT();
  const draft = useStore((s) => s.draft);
  const busy = useStore((s) => s.busy);
  const [listening, setListening] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [draft]);
  useEffect(() => { if (autoFocus || draft.endsWith(': ')) ref.current?.focus(); }, [autoFocus, draft]);
  const send = () => { if (draft.trim() && !busy) void runTurn(draft); };
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <textarea
        ref={ref}
        rows={1}
        dir="auto"
        value={draft}
        placeholder={listening ? t('listening') : t('typeHere')}
        aria-label={t('typeHere')}
        onChange={(e) => set({ draft: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
      />
      <button type="button" className={`icon-btn mic${listening ? ' live' : ''}`} aria-label={listening ? t('listening') : t('hold')} aria-pressed={listening}
        onClick={() => void toggleMic((text) => set((s) => ({ draft: s.draft ? `${s.draft} ${text}` : text })), setListening)}>
        <Icon name={listening ? 'stop' : 'mic'} />
      </button>
      <button type="submit" className="icon-btn send" aria-label={t('send')} disabled={!draft.trim() || !!busy}><Icon name="send" /></button>
    </form>
  );
}

export function Agent({ compact }: { compact: boolean }) {
  const t = useT();
  const messages = useStore((s) => s.project?.messages);
  const busy = useStore((s) => s.busy);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [messages?.length, busy]);

  return (
    <div className="agent">
      <header className="panel-head">
        <span className="avatar" aria-hidden="true"><Icon name="spark" size={18} /></span>
        <span className="who"><h2>{t('assistant')}</h2><small>{t('assistantSub')}</small></span>
        <button className="icon-btn" title={t('memory')} aria-label={t('memory')} onClick={() => set({ sheet: 'memory' })}><Icon name="book" /></button>
      </header>
      <div className="messages" ref={list} aria-live="polite">
        {!messages?.length && (
          <div className="chat-empty">
            <p>{t('emptyChat')}</p>
            {([['ex1', 'pen'], ['ex2', 'grid'], ['ex3', 'layers']] as const).map(([k, icon]) => (
              <button key={k} className="example" dir="auto" onClick={() => set({ draft: t(k) })}><Icon name={icon} size={18} /><span>{t(k)}</span></button>
            ))}
          </div>
        )}
        {messages?.map((m) => (
          <div key={m.id} className={`msg from-${m.role}`}>
            <p dir="auto">{m.text}</p>
            {(m.chips?.length || m.rule || m.fix) && (
              <div className="msg-chips">
                {m.chips?.map((c) => <button key={c.label} className="chip" dir="auto" disabled={!!busy} onClick={() => void runTurn(c.send)}>{c.label}</button>)}
                {m.fix && <button className="chip accent" disabled={!!busy} onClick={() => void runTurn(m.fix!)}><Icon name="spark" size={14} />{t('fixIt')}</button>}
                {m.rule && <button className="chip" onClick={() => void remember(m.rule!, m.id)}><Icon name="book" size={14} />{t('remember')}</button>}
              </div>
            )}
          </div>
        ))}
        {busy && busy.stage !== 'saving' && <div className="msg from-agent typing"><span className="dots" aria-hidden="true"><i /><i /><i /></span>{busy.text}</div>}
      </div>
      {!compact && <Composer />}
    </div>
  );
}

async function remember(rule: string, messageId: string) {
  const m = await api.get<Memory>('/api/memory');
  const next = { ...m, rules: [...m.rules, { id: uid(), text: rule }] };
  await api.put('/api/memory', next);
  set({ memory: next });
  // Drop the chip so it can't be saved twice.
  edit((p) => ({ messages: p.messages.map((x) => (x.id === messageId ? { ...x, rule: undefined } : x)) }), false);
  toast(tr(get().lang, 'remembered'));
}

export function MemorySheet() {
  const t = useT();
  const memory = useStore((s) => s.memory);
  const [text, setText] = useState('');
  useEffect(() => { void api.get<Memory>('/api/memory').then((m) => set({ memory: m })); }, []);
  if (!memory) return <p className="muted pad">…</p>;
  const save = (m: Memory) => { set({ memory: m }); void api.put('/api/memory', m).catch((e) => toast((e as Error).message)); };
  return (
    <div className="memory" dir="auto">
      <section>
        <h3>{t('rules')}</h3>
        <ul>
          {memory.rules.map((r) => (
            <li key={r.id}><span dir="auto">{r.text}</span><button className="icon-btn sm" aria-label={t('delete')} onClick={() => save({ ...memory, rules: memory.rules.filter((x) => x.id !== r.id) })}><Icon name="trash" size={16} /></button></li>
          ))}
        </ul>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { save({ ...memory, rules: [...memory.rules, { id: uid(), text: text.trim() }] }); setText(''); } }}>
          <input value={text} dir="auto" onChange={(e) => setText(e.target.value)} placeholder={t('addRule')} aria-label={t('addRule')} />
          <button className="btn primary sm" type="submit">{t('add')}</button>
        </form>
      </section>
      <section>
        <h3>{t('specs')}</h3>
        <ul>
          {memory.specs.map((s) => (
            <li key={s.id}><span><b>{s.part}</b> — {s.spec}</span><button className="icon-btn sm" aria-label={t('delete')} onClick={() => save({ ...memory, specs: memory.specs.filter((x) => x.id !== s.id) })}><Icon name="trash" size={16} /></button></li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{t('glossary')}</h3>
        <ul>
          {memory.glossary.map((g) => (
            <li key={g.id}><span dir="auto"><b>“{g.says}”</b> → {g.means}</span><button className="icon-btn sm" aria-label={t('delete')} onClick={() => save({ ...memory, glossary: memory.glossary.filter((x) => x.id !== g.id) })}><Icon name="trash" size={16} /></button></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
