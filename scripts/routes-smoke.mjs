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
const app = portable ? await launchPortable(path.resolve(process.env.TTR_PORTABLE_EXE ?? 'TtR Map Builder.exe'), env) : await electron.launch({ args: ['.'], env, timeout: 60_000 });
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
const selectedKind = page.getByLabel('Тип выбранного вагона');
const flipIcon = page.getByRole('button', { name: 'Развернуть значок', exact: true });
const wagonOnBoard = id => page.locator(`.map-objects [data-object-id="${id}"]`);
async function expectPaintedKind(id, kind) {
  const wagon = wagonOnBoard(id);
  await expect(wagon.locator('rect')).toHaveCount(1);
  await expect(wagon.locator(':scope > path')).toHaveCount(kind === 'tunnel' ? 1 : 0);
  await expect(wagon.locator('circle')).toHaveCount(kind === 'locomotive' ? 3 : 0);
  if (kind === 'locomotive') await expect(wagon.locator('rect')).toHaveAttribute('fill', '#9ca3af');
}
async function exportAs(format) {
  const target = path.join(out, `Маршруты.${format.toLowerCase()}`); await setSave(target);
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${format} `) }).click();
  await page.getByRole('button', { name: `Сохранить ${format}`, exact: true }).click(); await idle();
  await expect(page.getByRole('alert')).toHaveCount(0); return target;
}
try {
  // Open a pre-kind map with both a free wagon and a wagon already in a route.
  const legacyFile = path.join(out, 'Типы вагонов.ttrmap.json');
  const legacy = JSON.parse(await readFile('examples/Маршруты.ttrmap.json', 'utf8'));
  legacy.objects.push({ type: 'wagon', id: 'free', x: 320, y: 180, angle: 37, color: 'black' });
  await writeFile(legacyFile, JSON.stringify(legacy));
  await setOpen(legacyFile);
  await page.getByRole('button', { name: 'Открыть', exact: true }).click(); await idle();
  for (const id of ['free', 'blue-1']) {
    const wagon = wagonOnBoard(id);
    await page.locator('.inspector-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await wagon.click();
    await expect(selectedKind).toBeInViewport({ ratio: 1 });
    await expect(page.getByLabel('Тип нового вагона')).toHaveCount(0);
    await expect(selectedKind).toHaveValue('regular');
    await expectPaintedKind(id, 'regular');
    const regularImage = await wagon.screenshot();
    await selectedKind.selectOption('tunnel');
    await expect(flipIcon).toHaveCount(0);
    await expectPaintedKind(id, 'tunnel');
    await expect(wagon.locator(':scope > path')).toHaveAttribute('fill', id === 'free' ? '#e4e5e1' : '#30363b');
    const tunnelImage = await wagon.screenshot({ path: path.join(out, `tunnel-${id}.png`) });
    assert.ok(!regularImage.equals(tunnelImage), 'Mountain pictogram is painted on the board');
    await selectedKind.selectOption('locomotive');
    await expectPaintedKind(id, 'locomotive');
    assert.ok(!tunnelImage.equals(await wagon.screenshot()), 'Locomotive repaints the selected wagon');
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    await expectPaintedKind(id, 'tunnel');
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await expectPaintedKind(id, 'locomotive');
    const pose = await wagon.getAttribute('transform');
    const icon = wagon.locator(':scope > g');
    const initialDirection = await icon.getAttribute('transform');
    const initialImage = await wagon.screenshot();
    await expect(flipIcon).toHaveAttribute('aria-pressed', 'false');
    await flipIcon.click();
    await expect(icon).toHaveAttribute('transform', /^scale\(-/);
    await expect(wagon).toHaveAttribute('transform', pose);
    assert.ok(!initialImage.equals(await wagon.screenshot()), 'Only the locomotive pictogram flips at the current wagon angle');
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    await expect(icon).toHaveAttribute('transform', initialDirection);
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(flipIcon).toHaveAttribute('aria-pressed', 'true');
    await flipIcon.click();
    await expect(icon).toHaveAttribute('transform', initialDirection);
    await selectedKind.selectOption('regular');
    await expect(flipIcon).toHaveCount(0);
    await expectPaintedKind(id, 'regular');
    await expectPaintedKind('blue-2', 'regular');
  }
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await idle();
  assert.deepEqual(JSON.parse(await readFile(legacyFile, 'utf8')).routes, legacy.routes);
  await page.getByRole('button', { name: 'Новый', exact: true }).click(); await idle();
  log('existing free and routed wagon repaint immediately across all types, undo and redo');

  await page.getByRole('button', { name: 'Город', exact: true }).click();
  const nameField = page.getByRole('textbox', { name: 'Название города' });
  await click(100, 250);
  await expect(nameField).toBeFocused();
  await page.keyboard.insertText('Альфа');
  await click(550, 250);
  await expect(nameField).toBeFocused();
  await expect(nameField).toHaveValue('');
  await page.keyboard.insertText('Бета');
  await page.keyboard.press('Enter');
  const wagonCounter = page.getByTestId('wagon-count');
  await expect(wagonCounter).toHaveText('0');
  await page.getByRole('button', { name: 'Вагон', exact: true }).click();
  await page.getByLabel('Тип нового вагона').selectOption('locomotive');
  await click(320, 160);
  await expect(selectedKind).toHaveValue('locomotive');
  await expect(page.locator('.object-section').getByRole('button', { name: 'Синий', exact: true })).toBeDisabled();
  await expect(wagonCounter).toHaveText('1');
  await page.keyboard.press('Control+z');
  await expect(wagonCounter).toHaveText('0');
  await page.keyboard.press('r');
  await expect(page.getByRole('button', {name: 'Соединить', exact: true})).toHaveCount(0);
  await click(100, 250);
  await click(550, 250);
  await page.getByRole('button', { name: 'Создать маршрут', exact: true }).click();
  await expect(wagonCounter).toHaveText('3');
  await expect(lines).toHaveCount(4);
  let project = await save();
  assert.ok(project.objects.filter(o => o.type === 'wagon').every(w => (w.kind ?? 'regular') === 'regular'));
  assert.equal(project.version, 2);
  assert.deepEqual(project.objects.filter(o => o.type === 'city').map(o => o.name), ['Альфа', 'Бета']);
  const straightId = project.routes[0].id;
  log('city naming on consecutive clicks, free wagons and straight arc using the keyboard shortcut');

  await page.getByRole('button', { name: 'Маршрут', exact: true }).click();
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
  project = await save(); const auto = project.routes.find(r => r.id !== straightId);
  assert.equal(auto.wagons.length, 3);
  assert.ok(project.objects.find(o => o.id === auto.wagons[1].wagonId).y > 320);
  await expect(page.getByRole('button', { name: 'Создать параллельный', exact: true })).toBeDisabled();
  log('arc control, invalid count, automatic route, two-route limit');

  await expect(wagonCounter).toHaveText('6');
  await page.getByRole('button', { name: 'Маршрут', exact: true }).click();
  await click(550, 250); await click(100, 250);
  await expect(page.getByRole('button', { name: 'Создать маршрут', exact: true })).toBeDisabled();
  await expect(page.locator('.route-error')).toContainText('два маршрута');
  await page.getByRole('button', { name: 'Отменить создание', exact: true }).click();
  await expect(page.locator('.route-tools')).toHaveCount(0);

  // Removing a city leaves an unfinished route in the project.
  await page.getByRole('button', { name: 'Город', exact: true }).click();
  await click(100, 120);
  await nameField.press('Enter');
  await page.getByRole('button', { name: 'Маршрут', exact: true }).click();
  await click(100, 250); await click(100, 120);
  await field('Вагонов в маршруте', 1);
  await page.getByRole('button', { name: 'Создать маршрут', exact: true }).click();
  await click(100, 120);
  await page.keyboard.press('Delete');
  await expect(wagonCounter).toHaveText('7');
  await expect(lines).toHaveCount(9);
  log('third arc rejected, cancel returns to selection, city removal retains unfinished route');

  await page.getByRole('button', { name: 'Выделение', exact: true }).click(); await click(320, 250);
  const originalTransform = await page.locator('.map-objects [data-object-id]').filter({ has: page.locator('rect') }).nth(1).getAttribute('transform');
  await field('Угол поворота', 25);
  const rotated = await save(); const wagon = rotated.objects.find(o => o.id === project.routes[0].wagons[1].wagonId);
  assert.equal(wagon.angle, 25);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page.locator('.map-objects [data-object-id]').filter({ has: page.locator('rect') }).nth(1)).toHaveAttribute('transform', originalTransform);
  await page.getByLabel('Показывать соединения', { exact: true }).uncheck(); await expect(lines).toHaveCount(5);
  const straightWagons = project.routes.find(r => r.id === straightId).wagons.map(item => project.objects.find(o => o.id === item.wagonId));
  const [engine, tunnel] = straightWagons;
  await click(engine.x, engine.y);
  await selectedKind.selectOption('locomotive');
  await flipIcon.click();
  await click(tunnel.x, tunnel.y);
  await selectedKind.selectOption('tunnel');
  await page.locator('.route-details').getByRole('button', { name: 'Жёлтый', exact: true }).click();
  const saved = await save(); assert.equal(saved.routes.length, 3); assert.equal(saved.routes.find(r => r.id === straightId).showConnections, false);
  assert.equal(saved.objects.find(o => o.id === engine.id).color, 'gray');
  assert.equal(saved.objects.find(o => o.id === engine.id).locomotiveFlipped, true);
  assert.equal(saved.objects.find(o => o.id === tunnel.id).color, 'yellow');
  assert.deepEqual(saved.routes.find(r => r.id === straightId).wagons.map(item => saved.objects.find(o => o.id === item.wagonId).kind ?? 'regular'), ['locomotive', 'tunnel', 'regular']);
  await page.getByRole('button', { name: 'Новый', exact: true }).click(); await idle();
  await setOpen(file); await page.getByRole('button', { name: 'Открыть', exact: true }).click(); await idle();
  await expect(lines).toHaveCount(5); assert.deepEqual(await save(), saved);
  const engineIcon = wagonOnBoard(engine.id).locator(':scope > g');
  await expect(engineIcon).toHaveAttribute('transform', /^scale\(-/);
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
  assert.deepEqual(pixel(260, 250), [255, 255, 255], 'Hidden straight connector must be absent in PNG');
  const mountainPath = await wagonOnBoard(tunnel.id).locator(':scope > path').getAttribute('d');
  assert.ok(svg.includes(`d="${mountainPath}"`), 'Exported SVG uses the mountain silhouette displayed on the board');
  assert.ok(svg.includes(`transform="${await engineIcon.getAttribute('transform')}"`), 'SVG preserves the reflected locomotive');
  assert.deepEqual(pixel(engine.x + 5.7, engine.y - 1.5), [36, 40, 49], 'Mirrored cab is painted on the opposite side in PNG');
  assert.deepEqual(pixel(engine.x - 5.7, engine.y - 1.5), [156, 163, 175], 'Old cab position shows the gray wagon body');
  const routeColor = [243, 211, 98];
  assert.deepEqual(pixel(tunnel.x, tunnel.y + 1.8), routeColor, 'The portal opening shows the wagon color');
  assert.deepEqual(pixel(tunnel.x + 10, tunnel.y), routeColor, 'Wagon color surrounds the mountain');
  for (const [dx, dy] of [[-3, -2], [1.7, -2.5], [-3, 1.8], [3, 1.8]]) {
    const rgb = pixel(tunnel.x + dx, tunnel.y + dy);
    assert.ok(rgb.every((value, i) => Math.abs(value - [103, 98, 70][i]) <= 2), 'Both peaks and sides of the portal appear in PNG');
  }
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
  const parallel = final.routes.find(r => r.id !== straightId && r.startCityId && r.endCityId);
  assert.equal(parallel.wagons.length, 3);
  assert.ok(parallel.wagons.every(item => (final.objects.find(o => o.id === item.wagonId).kind ?? 'regular') === 'regular'));
  assert.ok(Math.abs(final.objects.find(o => o.id === parallel.wagons[1].wagonId).y - 263) < .01);
  await page.keyboard.press('Control+d'); const duplicated = await save();
  await expect(wagonCounter).toHaveText(String(duplicated.objects.filter(o => o.type === 'wagon').length));
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
