// Public phone-app download, outside the password gate: /app is a small page, /app/Ammarc.apk streams the
// newest "mobile-v*" GitHub Release APK. The repo is private, so the server reads it with a read-only token
// (GH_RELEASE_TOKEN). The APK holds only the site address — no keys, no password — so it is safe to hand out.
import { Readable } from 'node:stream';
import type { Express, Request } from 'express';
import { BRAND } from '../shared/types.ts';

const REPO = process.env.GH_RELEASE_REPO || 'Nexline1/ammarc';
const TOKEN = process.env.GH_RELEASE_TOKEN || '';
type Apk = { url: string; size: number; version: string };

const gh = (accept = 'application/vnd.github+json') => ({ Authorization: `Bearer ${TOKEN}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ammarc-server' });

let cache: { at: number; apk: Apk | null } | null = null;
async function latest(): Promise<Apk | null> {
  if (!TOKEN) return null;
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.apk;
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: gh() });
  if (!r.ok) throw new Error(`GitHub releases: ${r.status}`);
  const releases = (await r.json()) as { tag_name: string; draft: boolean; assets: { name: string; url: string; size: number }[] }[];
  const rel = releases.find((x) => !x.draft && x.tag_name.startsWith('mobile-v') && x.assets.some((a) => a.name.endsWith('.apk')));
  const asset = rel?.assets.find((a) => a.name.endsWith('.apk'));
  const version = rel?.tag_name.slice('mobile-v'.length).replace(/[^\w.-]/g, '') ?? '';
  cache = { at: Date.now(), apk: rel && asset ? { url: asset.url, size: asset.size, version } : null };
  return cache.apk;
}

// ponytail: in-memory per-IP cap (10 downloads/hour) so the free plan's bandwidth can't be drained; resets on restart.
const recent = new Map<string, number[]>();
const ipOf = (req: Request) => String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
function allow(ip: string) {
  const now = Date.now();
  if (recent.size > 5000) recent.clear();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= 10) return false;
  recent.set(ip, [...hits, now]);
  return true;
}

export function downloads(app: Express) {
  app.get('/app', async (_req, res) => {
    const apk = await latest().catch((e: Error) => (console.error(e.message), null));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.type('html').send(page(apk));
  });

  app.get('/app/Ammarc.apk', async (req, res, next) => {
    try {
      const apk = await latest();
      if (!apk) return res.redirect('/app');
      if (!allow(ipOf(req))) return res.status(429).type('text').send('Too many downloads from here. Try again in an hour.');
      // GitHub answers with a redirect to a signed file URL; fetch follows it and drops our token on the way (different host).
      const r = await fetch(apk.url, { headers: gh('application/octet-stream') });
      if (!r.ok || !r.body) throw new Error(`GitHub asset: ${r.status}`);
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="Ammarc-${apk.version}.apk"`);
      res.setHeader('Cache-Control', 'no-store');
      const len = r.headers.get('content-length');
      if (len) res.setHeader('Content-Length', len);
      Readable.fromWeb(r.body as import('node:stream/web').ReadableStream).pipe(res);
    } catch (e) {
      next(e);
    }
  });
}

const mark = `<svg viewBox="0 0 32 32" width="44" height="44" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#16191D"/><path d="M9 23L16 8l7 15M11.5 18h9" fill="none" stroke="#E8743A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function page(apk: Apk | null) {
  const mb = apk ? `${Math.round(apk.size / 1048576)} MB` : '';
  const body = apk
    ? `<a class="btn" href="/app/Ammarc.apk" download>Download for Android</a>
       <p class="meta">Version ${apk.version} · ${mb}</p>
       <ol>
         <li>Tap <b>Download for Android</b>.</li>
         <li>Open the downloaded file. If the phone asks, allow installing from this browser — once.</li>
         <li>Open <b>Ammarc</b> and sign in with the same password as the website.</li>
       </ol>
       <div dir="rtl" lang="ar" class="ar">
         <a class="btn" href="/app/Ammarc.apk" download>تحميل للأندرويد</a>
         <ol>
           <li>اضغط <b>تحميل للأندرويد</b>.</li>
           <li>افتح الملف. إذا سألك الجهاز، اسمح بالتثبيت من المتصفح مرة وحدة.</li>
           <li>افتح <b>Ammarc</b> وادخل بنفس كلمة سر الموقع.</li>
         </ol>
       </div>`
    : `<p class="meta">The Android app isn't available here yet.<br><span dir="rtl" lang="ar">تطبيق الأندرويد مو متوفر هني للحين.</span></p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${BRAND.name} for Android</title><meta name="robots" content="noindex">
<style>
  :root{color-scheme:light}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#16191d;background:radial-gradient(120% 80% at 50% 0%,#f6f7f9,#e6e9ed)}
  main{width:min(420px,100%);padding:28px;border-radius:24px;background:#fff;box-shadow:0 0 0 1px rgba(22,25,29,.06),0 24px 60px rgba(42,47,54,.14)}
  h1{margin:14px 0 4px;font-size:28px;line-height:1.1;letter-spacing:-.02em}
  .tag{margin:0 0 22px;color:#5b636e}
  .btn{display:flex;align-items:center;justify-content:center;height:54px;border-radius:16px;background:#cf5a1e;color:#fff;font-weight:700;font-size:17px;text-decoration:none}
  .btn:active{transform:scale(.98)}
  .meta{margin:10px 0 18px;text-align:center;color:#5b636e;font-size:14px}
  ol{margin:0;padding-inline-start:20px;color:#3f4650}
  li{margin:6px 0}
  .ar{margin-top:24px;padding-top:22px;border-top:1px solid rgba(22,25,29,.08)}
  .ar ol{margin-top:14px}
  .web{display:block;margin-top:22px;text-align:center;color:#b04716;font-weight:600;text-decoration:none}
</style></head><body><main>
${mark}
<h1>${BRAND.name} for Android</h1>
<p class="tag">${BRAND.tagline}</p>
${body}
<a class="web" href="/">Open in the browser instead · افتح في المتصفح</a>
</main></body></html>`;
}
