import type { RenderEvent } from '../shared/types.ts';

export class AuthError extends Error {}
let onAuth: () => void = () => {};
export const setAuthHandler = (fn: () => void) => { onAuth = fn; };

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) { onAuth(); throw new AuthError('Sign in first'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => req<T>('GET', url),
  post: <T>(url: string, body: unknown) => req<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => req<T>('PUT', url, body),
  del: <T>(url: string) => req<T>('DELETE', url),
};

export const fileUrl = (file: string) => `/files/${file}`;
export const upload = async (dataUrl: string) => (await api.post<{ file: string }>('/api/files', { dataUrl })).file;

/** POST and read the server-sent events of a render. */
export async function* renderStream(body: unknown): AsyncGenerator<RenderEvent> {
  const res = await fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) { onAuth(); throw new AuthError('Sign in first'); }
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Render failed (${res.status})`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let cut;
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, cut).trim();
      buf = buf.slice(cut + 2);
      if (line.startsWith('data: ')) yield JSON.parse(line.slice(6)) as RenderEvent;
    }
  }
}
