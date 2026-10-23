import './env.ts';
import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { CheckRequest, Memory, PitchRequest, Plan, Project, RenderRequest, TurnRequest, BRAND } from '../shared/types.ts';
import { compilePrompt } from './compile.ts';
import * as store from './store.ts';
import * as mock from './mock.ts';

const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT || 5180);
export const MOCK = process.env.MOCK === '1' || !process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY;
const PASSWORD = process.env.APP_PASSWORD || '';
const DAILY_IMAGE_CAP = Number(process.env.DAILY_IMAGE_CAP || 60);
const DAILY_CLAUDE_CAP = Number(process.env.DAILY_CLAUDE_CAP || 300);
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN || 20);
// With real keys and no password, only this computer may reach it (paid endpoints must never be open on the network).
const HOST = process.env.HOST || (!MOCK && !PASSWORD ? '127.0.0.1' : '0.0.0.0');
// On a public host his plant photos and the paid endpoints must never be open: no password, no start.
if (process.env.RENDER && !PASSWORD) {
  console.error('Refusing to start: set APP_PASSWORD in the Render dashboard (Environment).');
  process.exit(1);
}

// Real clients load only when keys exist, so demo mode never touches the network.
const claude = MOCK ? null : await import('./claude.ts');
const images = MOCK ? null : await import('./images.ts');

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// ---------- Password gate (single user) ----------
const SECRET = process.env.SESSION_SECRET || createHmac('sha256', 'armature').update(PASSWORD).digest('hex');
const TOKEN = createHmac('sha256', SECRET).update('armature-session-v1').digest('hex');
const cookieToken = (req: Request) => /(?:^|;\s*)arm=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1] || '';
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const authed = (req: Request) => !PASSWORD || same(cookieToken(req), TOKEN);

// ponytail: one global lockout (single-user app); per-IP buckets if it ever gets more users.
const failures: number[] = [];
app.post('/api/login', express.json(), async (req, res) => {
  const now = Date.now();
  while (failures.length && now - failures[0] > 15 * 60_000) failures.shift();
  if (failures.length >= 8) return res.status(429).json({ error: 'Too many wrong passwords — try again in 15 minutes.' });
  const pw = String(req.body?.password || '');
  if (!PASSWORD || same(createHmac('sha256', SECRET).update(pw).digest('hex'), createHmac('sha256', SECRET).update(PASSWORD).digest('hex'))) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `arm=${TOKEN}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
    return res.json({ ok: true });
  }
  failures.push(now);
  await new Promise((r) => setTimeout(r, 600));
  res.status(401).json({ error: 'Wrong password' });
});

app.get('/api/status', (req, res) => res.json({ mock: MOCK, auth: !!PASSWORD, authed: authed(req), brand: BRAND }));

app.use(['/api', '/files'], (req, res, next) => (authed(req) ? next() : res.status(401).json({ error: 'Sign in first' })));

// ---------- Rate + spend guards ----------
const hits: number[] = [];
const rate = (_req: Request, res: Response, next: NextFunction) => {
  const now = Date.now();
  while (hits.length && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= RATE_PER_MIN) return res.status(429).json({ error: 'Too many requests — wait a minute.' });
  hits.push(now);
  next();
};
/** Daily spend guard. Call it after the body is validated, so malformed requests never use up a slot. */
class CapReached extends Error {}
function spend(kind: 'images' | 'claude') {
  if (MOCK) return;
  const cap = kind === 'images' ? DAILY_IMAGE_CAP : DAILY_CLAUDE_CAP;
  if (!store.takeSlot(kind, cap)) throw new CapReached(`Daily ${kind === 'images' ? 'image' : 'assistant'} limit (${cap}) reached — it resets at midnight UTC.`);
}

const json = express.json({ limit: '60mb' });
const body = <T extends z.ZodType>(schema: T, req: Request): z.infer<T> => schema.parse(req.body);

// ---------- Files ----------
app.get('/files/:name', (req, res) => {
  const p = store.filePath(req.params.name);
  if (!p) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"); // an SVG opened directly can't run anything
  // dotfiles: 'allow' because DATA_DIR may sit in a dot-folder; the name itself is already validated by safeId.
  res.sendFile(p, { dotfiles: 'allow' }, (err) => err && !res.headersSent && res.status(404).end());
});
app.post('/api/files', json, (req, res) => {
  const { dataUrl } = body(z.object({ dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/) }), req);
  const ext = dataUrl.startsWith('data:image/png') ? 'png' : dataUrl.startsWith('data:image/webp') ? 'webp' : 'jpg';
  res.json({ file: store.saveFile(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'), ext) });
});

// ---------- Projects + memory ----------
app.get('/api/projects', (_req, res) => res.json(store.listProjects()));
app.get('/api/projects/:id', (req, res) => {
  const p = store.getProject(req.params.id);
  return p ? res.json(p) : res.status(404).json({ error: 'Not found' });
});
app.put('/api/projects/:id', json, (req, res) => {
  const p = body(Project, req);
  if (p.id !== req.params.id) return res.status(400).json({ error: 'id mismatch' });
  store.putProject(p);
  res.json({ ok: true });
});
app.get('/api/memory', (_req, res) => res.json(store.getMemory()));
app.put('/api/memory', json, (req, res) => {
  store.putMemory(body(Memory, req));
  res.json({ ok: true });
});

// ---------- The loop: plan -> render -> check ----------
app.post('/api/turn', rate, json, async (req, res) => {
  const turn = body(TurnRequest, req);
  spend('claude');
  const plan = claude ? await claude.planTurn(turn, store.getMemory()) : mock.mockPlan(turn);
  res.json({ plan, prompt: compilePrompt(plan, turn.scene) });
});

app.post('/api/render', rate, json, async (req, res) => {
  const r = body(RenderRequest, req);
  spend('images');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (ev: object) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  try {
    const events = images ? images.render(r.plan, compilePrompt(r.plan, r.scene), r.image, r.mask, r.refs, r.size) : mock.mockRender(r.image);
    for await (const ev of events) send(ev);
  } catch (e) {
    send({ type: 'error', message: (e as Error).message });
  }
  res.end();
});

app.post('/api/check', rate, json, async (req, res) => {
  const c = body(CheckRequest, req);
  spend('claude');
  res.json(claude ? await claude.checkResult(c.sentence, c.plan, c.before, c.after, c.lang) : mock.mockCheck());
});

app.post('/api/pitch', rate, json, async (req, res) => {
  const p = body(PitchRequest, req);
  spend('claude');
  res.json(claude ? await claude.draftPitch(p.lang, p.history, p.before, p.after) : mock.mockPitch(p.lang, p.history));
});

app.get('/api/parts', (_req, res) => res.json(store.getParts()));
app.post('/api/parts', json, (req, res) => {
  store.addPart(body(z.object({ file: z.string(), name: z.string().min(1).max(60) }), req));
  res.json({ ok: true });
});
app.delete('/api/parts/:file', (req, res) => {
  store.removePart(req.params.file);
  res.json({ ok: true });
});
app.post('/api/part', rate, json, async (req, res) => {
  const { plan } = body(z.object({ plan: Plan }), req);
  spend('images');
  const name = (plan.part_name || plan.items[0]?.what || 'Part').slice(0, 60);
  const file = images ? store.saveFile(await images.makePart(plan), 'png') : store.saveFile(Buffer.from(mock.mockPartSvg(name)), 'svg');
  store.addPart({ file, name });
  res.json({ file, name });
});

app.post('/api/transcribe', rate, express.raw({ type: 'audio/*', limit: '15mb' }), async (req, res) => {
  const lang = String(req.query.lang || 'en');
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No audio' });
  res.json({ text: images ? await images.transcribe(req.body, req.headers['content-type'] || 'audio/webm') : mock.mockTranscribe(lang) });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- Client ----------
if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const dist = path.resolve('dist');
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof z.ZodError ? 400 : err instanceof CapReached ? 429 : 500;
  if (status === 500) console.error(err.message);
  if (!res.headersSent) res.status(status).json({ error: status === 400 ? 'Invalid request' : err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`${BRAND.name} on http://localhost:${PORT}${MOCK ? '  (demo mode: no API keys)' : ''}`);
  if (HOST === '127.0.0.1') console.log('  Real API keys and no APP_PASSWORD: only this computer can open it. Set APP_PASSWORD to use it from a phone.');
});
