// The core loop on a laptop and a phone, in demo mode: photo -> element/mark -> one sentence -> version -> compare -> export.
import { expect, test, type Page } from '@playwright/test';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 1200;

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?new');
  await expect(page.getByText('Drop a photo of the spot')).toBeVisible();
  return errors;
}

async function uploadPhoto(page: Page) {
  const b64 = await page.evaluate(() => {
    const c = Object.assign(document.createElement('canvas'), { width: 1200, height: 900 });
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 1200, 900);
    g.addColorStop(0, '#8d9298'); g.addColorStop(1, '#5d636a');
    x.fillStyle = g; x.fillRect(0, 0, 1200, 900);
    x.fillStyle = '#c9a227'; x.fillRect(100, 600, 1000, 30); // a "handrail"
    x.fillStyle = '#3a3f45'; x.fillRect(450, 200, 300, 380); // a "furnace"
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'plant.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await expect(page.getByRole('toolbar').first()).toBeVisible();
  await page.waitForFunction(() => (window as any).__armBoard?.api?.size()?.w === 1200);
}

async function boardBox(page: Page) {
  const box = await page.locator('.board').boundingBox();
  return box!;
}

async function send(page: Page, text: string) {
  if (isPhone(page)) {
    await page.locator('.dock').getByRole('button', { name: 'Chat' }).click();
    await page.getByRole('dialog').getByRole('textbox').fill(text);
    await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  } else {
    await page.locator('.panel.right').getByRole('textbox').fill(text);
    await page.keyboard.press('Enter');
  }
}

test('photo → door element → flip hinge → mark → one sentence → new version → compare → undo', async ({ page }) => {
  const errors = await boot(page);
  await uploadPhoto(page);
  const b = await boardBox(page);

  // Add an inspection door: drag on a laptop, tap in the sheet on a phone.
  if (isPhone(page)) {
    await page.locator('.dock').getByRole('button', { name: 'Elements' }).click();
    await page.getByRole('dialog').getByPlaceholder('Search elements').fill('inspection');
    await page.getByRole('dialog').getByRole('button', { name: 'Inspection door' }).click();
  } else {
    const tile = page.locator('.panel.left').getByRole('button', { name: 'Inspection door' });
    const t = (await tile.boundingBox())!;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.5, { steps: 12 });
    await page.mouse.up();
  }
  const ctx = page.getByRole('toolbar', { name: 'Inspection door' });
  await expect(ctx).toBeVisible();
  await ctx.getByRole('button', { name: /Hinge: left/ }).click();
  await expect(ctx.getByRole('button', { name: /Hinge: right/ })).toBeVisible();
  await ctx.getByRole('button', { name: 'Close' }).click();

  // Red mark around a spot.
  await page.getByRole('button', { name: 'Mark', exact: true }).click();
  const cx = b.x + b.width * 0.65, cy = b.y + b.height * 0.45, r = 30;
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let a = 0; a <= Math.PI * 2; a += Math.PI / 8) await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  await page.mouse.up();

  await send(page, 'make this a real steel inspection door');
  if (isPhone(page)) await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // A second version exists, so before/after is available.
  const compareBtn = isPhone(page) ? page.locator('.dock').getByRole('button', { name: 'Before / after' }) : page.getByRole('button', { name: 'Before / after' });
  await expect(compareBtn).toBeEnabled({ timeout: 20_000 });
  await compareBtn.click();
  await expect(page.getByRole('slider', { name: 'Before / after' })).toBeVisible();
  await page.locator('.close-compare').click();

  // Undo returns to the original photo (no parent version, so nothing to compare).
  if (isPhone(page)) {
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.dock').getByRole('button', { name: 'Versions' })).toBeVisible();
  } else {
    await page.keyboard.press('Control+z');
    await expect(compareBtn).toBeDisabled();
  }

  expect(errors).toEqual([]);
});

test('"Tap where" is the only question, and the tap re-sends the sentence', async ({ page }) => {
  test.skip(isPhone(page), 'laptop flow');
  const errors = await boot(page);
  await uploadPhoto(page);
  await send(page, 'put a metal door here');
  await expect(page.locator('.hint')).toContainText('Tap where');
  const b = await boardBox(page);
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.5);
  await expect(page.locator('.rail-btn .badge')).toHaveText('2', { timeout: 20_000 });
  await expect(page.locator('.msg.from-agent').last()).toBeVisible();
  // His hinge assumption is offered as a one-tap alternative.
  await expect(page.getByRole('button', { name: 'Put the hinge on the right' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('export: PNG and PowerPoint pitch slide download', async ({ page }) => {
  const errors = await boot(page);
  await uploadPhoto(page);
  if (isPhone(page)) await page.locator('.dock').getByRole('button', { name: 'Export' }).click();
  else await page.locator('.topbar').getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog');
  const png = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await png).suggestedFilename()).toMatch(/\.png$/);
  await dialog.getByRole('button', { name: 'Draft with Claude' }).click();
  await expect(dialog.getByRole('textbox').nth(1)).not.toHaveValue('');
  const pptx = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download .pptx' }).click();
  expect((await pptx).suggestedFilename()).toMatch(/\.pptx$/);
  expect(errors).toEqual([]);
});

test('phone: two-finger pinch zooms the board', async ({ page }) => {
  test.skip(!isPhone(page), 'touch flow');
  await boot(page);
  await uploadPhoto(page);
  const b = await boardBox(page);
  const before = await page.evaluate(() => (window as any).__armBoard.api.scale());
  const cdp = await page.context().newCDPSession(page);
  const y = b.y + b.height / 2, x = b.x + b.width / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] });
  for (let d = 30; d <= 120; d += 10) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await page.evaluate(() => (window as any).__armBoard.api.scale());
  expect(after).toBeGreaterThan(before * 2);
});

test('Arabic interface switch', async ({ page }) => {
  await boot(page);
  await page.locator('.topbar').getByRole('button', { name: 'Language' }).click();
  await expect(page.getByText('حط صورة المكان هنا')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});
