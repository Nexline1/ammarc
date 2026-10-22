// Plan -> image-model prompt. Deterministic on purpose: Claude decides *what*,
// this template decides *how it is said*, so every render gets the same structure.
import type { Plan, Scene } from '../shared/types.ts';

const STYLE: Record<Plan['style'], string> = {
  photo: 'Photorealistic, matching the existing photo exactly: same camera angle, lens, lighting, white balance, grain and level of detail.',
  '3d_render': 'Convincing 3D industrial rendering: realistic steel and concrete materials, soft studio lighting, clean background. Keep the original geometry, proportions and every requested detail.',
  drawing: 'Clean technical illustration with crisp edges, neutral background, engineering-drawing feel.',
};

export function compilePrompt(plan: Plan, scene: Scene): string {
  const lines: string[] = [];
  lines.push(`CHANGE: ${plan.change.trim()}`);

  if (plan.items.length) {
    lines.push('', 'ITEMS:');
    for (const it of plan.items) {
      const el = scene.elements.find((e, i) => `E${i + 1}` === it.tag);
      const bits = [it.what, it.material && `material: ${it.material}`, it.size_cm && `size: ${it.size_cm} (for proportion only)`,
        it.orientation && `orientation: ${it.orientation}`, it.position && `position: ${it.position}`];
      if (el) bits.push(`it replaces the flat line-drawing placeholder of a ${el.name.toLowerCase()} at that exact spot; keep its placement, scale and angle`);
      lines.push(`- ${it.tag}: ${bits.filter(Boolean).join('; ')}`);
    }
  }

  if (plan.region !== 'whole') {
    lines.push('', 'KEEP EXACTLY (do not move, remove, restyle or recolour):');
    for (const p of plan.preserve) lines.push(`- ${p}`);
    lines.push('- everything outside the edited area: walls, floor, pipes, ducts, grating, handrails, doors, plates, labels and their positions');
    lines.push('- camera angle, framing, perspective, lighting, colours, contrast and saturation');
  } else if (plan.preserve.length) {
    lines.push('', 'KEEP:');
    for (const p of plan.preserve) lines.push(`- ${p}`);
  }

  lines.push('', `STYLE: ${STYLE[plan.style]}`);
  lines.push('Do not add text, labels, dimension lines, arrows, watermarks or red marks. Do not add anything that was not asked for.');
  return lines.join('\n');
}

export function compilePartPrompt(plan: Plan): string {
  const name = plan.part_name || plan.items[0]?.what || 'industrial part';
  return [
    `A single ${name}, as a real industrial component.`,
    plan.items[0]?.material ? `Material: ${plan.items[0].material}.` : '',
    'Isolated on a fully transparent background, three-quarter view, realistic steel finish, soft even lighting.',
    'No scenery, no floor, no shadow, no checkerboard, no text.',
  ].filter(Boolean).join(' ');
}
