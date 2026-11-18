// Round 3: true-to-scale placement, view chips, proposal deck and supervisor email (demo mode, laptop).
import { expect, test, type Page } from '@playwright/test';

test.skip(({ viewport }) => (viewport?.width ?? 0) < 1200, 'laptop flows');

const state = (page: Page) => page.evaluate(() => {
  const s = (window as any).__armState();
  return { scene: s.project.scene, versions: s.project.versions.map((v: any) => ({ id: v.id, parent: v.parent })), current: s.project.current };
});

async function start(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?new');
  const b64 = await page.evaluate(() => {
    const c = Object.assign(document.createElement('canvas'), { width: 1200, height: 900 });
    const x = c.getContext('2d')!;
    x.fillStyle = '#7d848b'; x.fillRect(0, 0, 1200, 900);
    x.fillStyle = '#3a3f45'; x.fillRect(450, 200, 300, 380);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'plant.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await page.waitForFunction(() => (window as any).__armBoard?.api?.size()?.w === 1200);
  return errors;
}

test('set scale from one dimension, then a dropped door comes in at 90 cm', async ({ page }) => {
  const errors = await start(page);
  const b = (await page.locator('.board').boundingBox())!;
  await page.getByRole('button', { name: 'Dimension', exact: true }).click();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.locator('.pending input').fill('90 cm');
  await page.getByRole('button', { name: 'Set as scale' }).click();
  const s1 = await state(page);
  expect(s1.scene.scale.pxPerCm).toBeGreaterThan(0);

  await page.locator('.panel.left').getByRole('button', { name: 'Inspection door' }).press('Enter');
  await expect.poll(async () => (await state(page)).scene.elements.length).toBe(1);
  const { scene } = await state(page);
  expect(scene.elements[0].w).toBeCloseTo(90 * scene.scale.pxPerCm, 0);

  // A second dimension line comes pre-filled with its measured length.
  await page.getByRole('button', { name: 'Close' }).first().click().catch(() => undefined);
  await page.getByRole('button', { name: 'Dimension', exact: true }).click();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.45, b.y + b.height * 0.7, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.pending input')).toHaveValue(/^≈ \d+ cm$/);
  expect(errors).toEqual([]);
});

test('a view chip makes a new version that branches from the current one', async ({ page }) => {
  const errors = await start(page);
  const before = await state(page);
  await page.locator('.view-chips').getByRole('button', { name: 'Side view' }).click();
  await expect.poll(async () => (await state(page)).versions.length, { timeout: 20_000 }).toBe(2);
  const after = await state(page);
  expect(after.versions[1].parent).toBe(before.current);
  expect(after.current).toBe(after.versions[1].id);
  expect(errors).toEqual([]);
});

test('proposal deck downloads, and the supervisor email is drafted and copyable', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await start(page);
  await page.locator('.topbar').getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog');
  const pptx = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /Download \.pptx \(1\)/ }).click();
  expect((await pptx).suggestedFilename()).toMatch(/\.pptx$/);

  await dialog.getByRole('button', { name: 'Draft email' }).click();
  await expect(dialog.getByLabel('Subject')).not.toHaveValue('');
  await expect(dialog.getByRole('link', { name: 'Open in mail' })).toHaveAttribute('href', /^mailto:\?subject=/);
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('Copied');
  expect(errors).toEqual([]);
});
