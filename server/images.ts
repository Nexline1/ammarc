// OpenAI = the renderer. Streams partial previews, then the final image.
import OpenAI, { toFile } from 'openai';
import { compilePartPrompt } from './compile.ts';
import type { Plan, RenderEvent } from '../shared/types.ts';

const EDIT_MODEL = process.env.IMAGE_MODEL_EDIT || 'gpt-image-2.5-sunburst';
const FAST_MODEL = process.env.IMAGE_MODEL_FAST || 'gpt-image-2.5-flare';
const QUALITY = (process.env.IMAGE_QUALITY || 'medium') as 'low' | 'medium' | 'high';
const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || 'gpt-transcribe';

let client: OpenAI | null = null;
const api = () => (client ??= new OpenAI());

const fromDataUrl = (d: string) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');

export async function* render(plan: Plan, prompt: string, image: string, mask: string | null, refs: string[], size: string): AsyncGenerator<RenderEvent> {
  const files = [await toFile(fromDataUrl(image), 'scene.png', { type: 'image/png' })];
  for (const [i, r] of refs.entries()) files.push(await toFile(fromDataUrl(r), `ref${i}.png`, { type: 'image/png' }));
  const stream = await api().images.edit({
    model: plan.action === 'generate' ? FAST_MODEL : EDIT_MODEL,
    image: files,
    ...(mask ? { mask: await toFile(fromDataUrl(mask), 'mask.png', { type: 'image/png' }) } : {}),
    prompt,
    size,
    quality: QUALITY,
    output_format: 'png',
    stream: true,
    partial_images: 2,
  });
  for await (const ev of stream) {
    if (ev.type === 'image_edit.partial_image') yield { type: 'partial', b64: ev.b64_json };
    else if (ev.type === 'image_edit.completed') yield { type: 'image', b64: ev.b64_json };
  }
}

export async function makePart(plan: Plan): Promise<Buffer> {
  const res = await api().images.generate({
    model: FAST_MODEL,
    prompt: compilePartPrompt(plan),
    background: 'transparent',
    output_format: 'png',
    size: '1024x1024',
    quality: QUALITY,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image returned.');
  return Buffer.from(b64, 'base64');
}

export async function transcribe(audio: Buffer, mime: string): Promise<string> {
  const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
  const res = await api().audio.transcriptions.create({ file: await toFile(audio, `speech.${ext}`, { type: mime }), model: TRANSCRIBE_MODEL });
  return res.text.trim();
}
