import { _electron as electron } from 'playwright';
import { expect } from 'playwright/test';
import { PNG } from 'pngjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchPortable } from './portable-driver.mjs';

const portable = process.argv.includes('--portable');
const out = path.resolve(portable ? 'test-results/routes-portable' : 'test-results/routes');
await mkdir(out, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = portable ? await launchPortable(path.resolve('TtR Map Builder.exe'), env) : await electron.launch({ args: ['.'], env, timeout: 60_000 });
const page = await app.firstWindow(); page.setDefaultTimeout(15_000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const file = path.join(out, 'Маршруты.ttrmap.json');
const log = message => console.log(`PASS ${message}`);
async function idle() { await page.locator('.busy-overlay').waitFor({ state: 'hidden', timeout: 60_000 }); }
async function setSave(filename) { await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename }); }, filename); }
async function setOpen(filename) { await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, filename); }
async function save() { await setSave(file); await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await idle(); return JSON.parse(await readFile(file, 'utf8')); }
async function field(label, value) { const input = page.getByRole('textbox', { name: label, exact: true }); await input.fill(String(value)); await input.press('Enter'); }
async function world(x, y) { return page.locator('.board-svg > g').evaluate((el, { x, y }) => { const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM()); return { x: p.x, y: p.y }; }, { x, y }); }
async function click(x, y) { const p = await world(x, y); await page.mouse.click(p.x, p.y); }
async function drag(ax, ay, bx, by) {
  const a = await world(ax, ay), b = await world(bx, by);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
}
const lines = page.locator('[data-connection]');
async function exportAs(format) {
  const target = path.join(out, `Маршруты.${format.toLowerCase()}`); await setSave(target);
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${format} `) }).click();
  await page.getByRole('button', { name: `Сохранить ${format}`, exact: true }).click(); await idle();
  await expect(page.getByRole('alert')).toHaveCount(0); return target;
}
try {
  await page.getByRole('button', { name: 'Город', exact: true }).click();
  await click(100, 250); await field('Название города', 'Альфа');
  await click(550, 250); await field('Название города', 'Бета');
  await page.getByRole('button', { name: 'Вагон', exact: true }).click();
  for (const x of [200, 320, 440]) await click(x, 250);
  await page.getByRole('button', { name: 'Маршрут', exact: true }).click();
  const cancelStart = await world(333, 250), cancelEnd = await world(427, 250);
  await page.mouse.move(cancelStart.x, cancelStart.y); await page.mouse.down();
  await page.mouse.move(cancelEnd.x, cancelEnd.y, { steps: 5 }); await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(lines).toHaveCount(0);
  await drag(333, 250, 427, 250); await expect(lines).toHaveCount(1);
  await drag(213, 250, 307, 250); await expect(lines).toHaveCount(2);
  await drag(100, 250, 187, 250); await expect(lines).toHaveCount(3);
  await drag(453, 250, 550, 250); await expect(lines).toHaveCount(4);
  let project = await save(); assert.equal(project.version, 2); assert.equal(project.routes.length, 1); assert.equal(project.routes[0].wagons.length, 3);
  const manualId = project.routes[0].id;
  log('manual drag connections from middle wagons to both cities');

  await page.getByRole('button', { name: 'По дуге', exact: true }).click();
  await page.getByLabel('Начальный город', { exact: true }).selectOption({ label: 'Альфа' });
  await page.getByLabel('Конечный город', { exact: true }).selectOption({ label: 'Бета' });
  await expect(page.getByTestId('curve-control')).toBeVisible();
  await field('Вагонов в маршруте', 99); await expect(page.getByRole('button', { name: 'Создать маршрут', exact: true })).toBeDisabled();
  await field('Вагонов в маршруте', 3);
  await drag(325, 250, 325, 430);
  await page.locator('.route-tools').getByRole('button', { name: 'Синий', exact: true }).click();
  await page.screenshot({ path: path.join(out, '01-arc-preview.png') });
  await page.getByRole('button', { name: 'Создать маршрут', exact: true }).click();
  await expect(lines).toHaveCount(8); await expect(page.locator('.map-objects [data-object-id]')).toHaveCount(8);
  project = await save(); const auto = project.routes.find(r => r.id !== manualId);
  assert.equal(auto.wagons.length, 3);
  assert.ok(project.objects.find(o => o.id === auto.wagons[1].wagonId).y > 320);
  await expect(page.getByRole('button', { name: 'Создать параллельный', exact: true })).toBeDisabled();
  log('arc control, invalid count, automatic route, two-route limit');

  await page.getByRole('button', { name: 'Вагон', exact: true }).click(); await click(325, 130);
  await page.getByRole('button', { name: 'Маршрут', exact: true }).click();
  await drag(100, 250, 312, 130); await expect(lines).toHaveCount(9);
  await drag(338, 130, 550, 250); await expect(page.getByRole('alert')).toContainText('максимум два');
  await expect(lines).toHaveCount(9); await page.getByRole('button', { name: 'Скрыть уведомление' }).click();
  log('third completion rejected while unfinished chain stays intact');

  await page.getByRole('button', { name: 'Выделение', exact: true }).click(); await click(320, 250);
  const originalTransform = await page.locator('.map-objects [data-object-id]').filter({ has: page.locator('rect') }).nth(1).getAttribute('transform');
  await field('Угол поворота', 25);
  const rotated = await save(); const wagon = rotated.objects.find(o => o.id === project.routes[0].wagons[1].wagonId);
  assert.equal(wagon.angle, 25);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page.locator('.map-objects [data-object-id]').filter({ has: page.locator('rect') }).nth(1)).toHaveAttribute('transform', originalTransform);
  await page.getByLabel('Показывать соединения', { exact: true }).uncheck(); await expect(lines).toHaveCount(5);
  const saved = await save(); assert.equal(saved.routes.length, 3); assert.equal(saved.routes.find(r => r.id === manualId).showConnections, false);
  await page.getByRole('button', { name: 'Новый', exact: true }).click(); await idle();
  await setOpen(file); await page.getByRole('button', { name: 'Открыть', exact: true }).click(); await idle();
  await expect(lines).toHaveCount(5); assert.deepEqual(await save(), saved);
  log('individual rotation, undo, hidden route and incomplete route round-trip');

  const invalid = path.join(out, 'invalid-route.ttrmap.json');
  await writeFile(invalid, JSON.stringify({ ...saved, routes: [{ ...saved.routes[0], startCityId: 'missing-city' }] }));
  await setOpen(invalid); await page.getByRole('button', { name: 'Открыть', exact: true }).click(); await idle();
  await expect(page.getByRole('alert')).toContainText('отсутствующий город');
  await page.getByRole('button', { name: 'Скрыть уведомление' }).click();
  assert.deepEqual(await save(), saved); log('invalid route file rejected without replacing the project');

  const svgPath = await exportAs('SVG'), pngPath = await exportAs('PNG');
  const svg = await readFile(svgPath, 'utf8'); assert.equal((svg.match(/<line /g) || []).length, 5); assert.ok(!svg.includes('data-port'));
  const coordinates = await page.evaluate(svg => {
    const attrs = ['x1', 'y1', 'x2', 'y2'];
    const exported = [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('line')].map(el => attrs.map(a => Number(el.getAttribute(a))));
    const editor = [...document.querySelectorAll('.route-connections > g > line:first-child')].map(el => attrs.map(a => Number(el.getAttribute(a))));
    return { exported, editor };
  }, svg);
  assert.deepEqual(coordinates.editor, coordinates.exported);
  const pngBytes = await readFile(pngPath), png = PNG.sync.read(pngBytes); assert.equal(png.width, 9272); assert.equal(png.height, 6201);
  const phys = pngBytes.indexOf(Buffer.from('pHYs'));
  assert.ok(phys > 0); assert.equal(pngBytes.readUInt32BE(phys + 4), Math.round(300 / .0254)); assert.equal(pngBytes[phys + 12], 1);
  const pixel = (x, y) => {
    const at = (Math.round(y / 525 * png.height) * png.width + Math.round(x / 785 * png.width)) * 4;
    return [...png.data.subarray(at, at + 3)];
  };
  for (const [x1, y1, x2, y2] of coordinates.exported) assert.ok(pixel((x1 + x2) / 2, (y1 + y2) / 2).every(c => c < 180), 'Visible connector must appear in PNG');
  assert.deepEqual(pixel(260, 250), [255, 255, 255], 'Hidden manual connector must be absent in PNG');
  await page.screenshot({ path: path.join(out, '02-complete-routes.png') });
  log('SVG and 300 DPI PNG include only visible connectors');

  await page.locator(`[data-connection][data-route-id="${auto.id}"][data-slot="0"]`).click();
  await page.keyboard.press('Delete'); await expect(lines).toHaveCount(4);
  await page.keyboard.press('Control+z'); await expect(lines).toHaveCount(5);
  const firstAuto = saved.objects.find(o => o.id === auto.wagons[0].wagonId);
  await click(firstAuto.x, firstAuto.y); await page.getByRole('button', { name: 'Разобрать маршрут', exact: true }).click();
  await expect(lines).toHaveCount(1); await expect(page.locator('.map-objects [data-object-id]')).toHaveCount(9);
  await click(320, 250); await page.getByRole('button', { name: 'Создать параллельный', exact: true }).click();
  await page.locator('.route-tools').getByRole('button', { name: 'Красный', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Создать маршрут', exact: true })).toBeEnabled();
  await page.screenshot({ path: path.join(out, '03-parallel-preview.png') });
  await page.getByRole('button', { name: 'Создать маршрут', exact: true }).click(); await expect(lines).toHaveCount(5);
  const final = await save();
  const parallel = final.routes.find(r => r.id !== manualId && r.startCityId && r.endCityId);
  assert.equal(parallel.wagons.length, 3);
  assert.ok(Math.abs(final.objects.find(o => o.id === parallel.wagons[1].wagonId).y - 263) < .01);
  await page.keyboard.press('Control+d'); const duplicated = await save();
  assert.equal(duplicated.routes.length, final.routes.length); assert.equal(duplicated.objects.length, final.objects.length + 1);
  log('delete connection, undo, dismantle, parallel preview, free duplicate');
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ passed: true, portable, rendererErrors: errors, routes: final.routes.length, png: { width: png.width, height: png.height, dpi: 300 } }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); console.error(error); process.exitCode = 1;
} finally {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close();
}
