import { _electron as electron } from 'playwright';
import { expect } from 'playwright/test';
import { PNG } from 'pngjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchPortable } from './portable-driver.mjs';

const portable = process.argv.includes('--portable');
const development = process.argv.includes('--dev');
const out = path.resolve(portable ? 'test-results/portable' : 'test-results');
await mkdir(out, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let server;
if (development) {
  server = await (await import('vite')).createServer();
  await server.listen();
  env.VITE_DEV_SERVER_URL = server.resolvedUrls.local[0];
}
const app = portable ? await launchPortable(path.resolve('TtR Map Builder.exe'), env) : await electron.launch({ args: ['.'], env, timeout: 60_000 });
const page = await app.firstWindow();
page.setDefaultTimeout(12_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const projectFile = path.join(out, 'Проверка.ttrmap.json');
const pngFile = path.join(out, 'Проверка.png');
const svgFile = path.join(out, 'Проверка.svg');
const backgroundFile = path.join(out, 'Подложка.png');
const log = text => console.log(`PASS ${text}`);
async function setSave(filename) { await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = async () => filename ? { canceled: false, filePath: filename } : { canceled: true, filePath: undefined }; }, filename); }
async function setOpen(filename) { await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: !filename, filePaths: filename ? [filename] : [] }); }, filename); }
async function confirm(response) { await app.evaluate(({ dialog }, response) => { dialog.showMessageBox = async () => ({ response, checkboxChecked: false }); }, response); }
async function idle() { await page.locator('.busy-overlay').waitFor({ state: 'hidden', timeout: 60_000 }); }
async function field(label, value) { const input = page.getByRole('textbox', { name: label, exact: true }); await input.fill(String(value)); await input.press('Enter'); }
async function world(x, y) { return page.locator('.board-svg > g').evaluate((el, { x, y }) => { const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM()); return { x: p.x, y: p.y }; }, { x, y }); }
async function clickWorld(x, y) { const point = await world(x, y); await page.mouse.click(point.x, point.y); }
async function exportAs(format, filename, dpi) {
  await setSave(filename);
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${format.toUpperCase()} `) }).click();
  if (dpi) await page.getByLabel('Разрешение PNG').selectOption(String(dpi));
  await page.getByRole('button', { name: `Сохранить ${format.toUpperCase()}`, exact: true }).click(); await idle();
  assert.equal(await page.getByRole('alert').count(), 0, 'No export error');
}
async function readProject() { await setSave(projectFile); await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await idle(); return JSON.parse(await readFile(projectFile, 'utf8')); }
try {
  await page.getByRole('button', { name: 'Город', exact: true }).waitFor();
  await page.evaluate(() => {
    globalThis.pointerTrace = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture']) document.addEventListener(type, event => {
      globalThis.pointerTrace.push({ type, x: event.clientX, y: event.clientY, target: event.target.tagName, captured: document.querySelector('.board-svg').hasPointerCapture(event.pointerId) });
    }, true);
  });
  await page.screenshot({ path: path.join(out, '01-empty.png') });
  assert.equal(await page.getByRole('textbox', { name: 'Длина поля', exact: true }).inputValue(), '785');
  log('blank offline launch and default sizes');

  await page.getByRole('button', { name: 'Город', exact: true }).click();
  const newMarker = page.getByRole('group', { name: 'Оформление нового города', exact: true });
  const chosenMarker = page.getByRole('group', { name: 'Оформление выбранного города', exact: true });
  const markerFor = name => page.locator('.map-objects [data-object-id]').filter({ hasText: name }).locator('use');
  await expect(newMarker.getByRole('button', { name: 'Белый', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await newMarker.getByRole('button', { name: 'Абрикос', exact: true }).click();
  await clickWorld(160, 180); await field('Название города', 'Москва');
  await newMarker.getByRole('button', { name: 'Лазурь', exact: true }).click();
  await expect(markerFor('Москва')).toHaveAttribute('href', '#city-marker-apricot');
  await clickWorld(560, 180); await field('Название города', 'Санкт-Петербург');
  await page.getByRole('button', { name: 'Выделение', exact: true }).click();
  await clickWorld(160, 180);
  for (const [name, id] of [['Янтарь', 'amber'], ['Мандарин', 'mandarin'], ['Деним', 'denim'], ['Сапфир', 'sapphire']]) {
    await chosenMarker.getByRole('button', { name, exact: true }).click();
    await expect(markerFor('Москва')).toHaveAttribute('href', '#city-marker-' + id);
    await expect(markerFor('Санкт-Петербург')).toHaveAttribute('href', '#city-marker-azure');
  }
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(markerFor('Москва')).toHaveAttribute('href', '#city-marker-denim');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(markerFor('Москва')).toHaveAttribute('href', '#city-marker-sapphire');
  log('six individual city styles, independent placement preference, undo and redo');
  const start = await world(560, 180), end = await world(590, 195);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => Math.abs(Number((await page.getByRole('textbox', { name: 'X объекта', exact: true }).inputValue()).replace(',', '.')) - 590)).toBeLessThan(.01);
  const label = page.locator('[data-part="label"]').last();
  const box = await label.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 15, { steps: 5 }); await page.mouse.up();
  assert.notEqual(await page.getByRole('textbox', { name: 'Смещение подписи X', exact: true }).inputValue(), '8');
  log('city creation, Cyrillic labels, dragging cities and labels');

  const moscowLabel = page.locator('[data-part="label"]').filter({ hasText: 'Москва' });
  await expect(moscowLabel).toHaveAttribute('font-size', '3.5');
  await expect(moscowLabel).toHaveCSS('font-family', 'Georgia, serif');
  await expect(moscowLabel).toHaveCSS('font-weight', '700');
  await expect(moscowLabel).toHaveCSS('fill', 'rgb(80, 59, 52)');
  await expect(moscowLabel).toHaveCSS('stroke', 'rgb(255, 247, 229)');
  const fontSize = page.getByRole('textbox', { name: 'Общий размер шрифта городов', exact: true });
  await expect(page.getByRole('textbox', { name: 'Размер шрифта этого города' })).toHaveCount(0);
  async function expectLabelSize(size) {
    await expect(moscowLabel).toHaveAttribute('font-size', size);
    await expect(label).toHaveAttribute('font-size', size);
  }
  await fontSize.fill('4,');
  await fontSize.pressSequentially('25');
  await expect(fontSize).toBeFocused();
  await expectLabelSize('4.25');
  await fontSize.press('Enter');
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expectLabelSize('3.5');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expectLabelSize('4.25');
  await fontSize.fill('6,5');
  await expectLabelSize('6.5');
  await fontSize.press('Escape');
  await expectLabelSize('4.25');
  await fontSize.fill('0');
  await fontSize.press('Enter');
  await expectLabelSize('4.25');
  await field('Общий размер шрифта городов', 5);
  await expectLabelSize('5');
  await page.getByRole('button', { name: 'Город', exact: true }).click();
  await clickWorld(300, 135); await field('Название города', 'Казань');
  await expect(page.locator('[data-part="label"]').filter({ hasText: 'Казань' })).toHaveAttribute('font-size', '5');
  await page.getByRole('button', { name: 'Удалить объект', exact: true }).click();
  log('global city label size redraws existing cities while typing, applies to new cities, and supports undo');

  const colors = ['Серый', 'Белый', 'Чёрный', 'Розовый', 'Зелёный', 'Синий', 'Красный', 'Жёлтый', 'Оранжевый'];
  await page.getByRole('button', { name: 'Вагон', exact: true }).click();
  for (let i = 0; i < colors.length; i++) {
    await page.getByRole('group', { name: 'Цвет вагона' }).first().getByRole('button', { name: colors[i], exact: true }).click();
    await clickWorld(150 + i * 53, 310);
  }
  assert.equal(await page.locator('[data-object-id]').count(), 11);
  await page.getByRole('button', { name: 'Выделение', exact: true }).click();
  await field('Угол поворота', '37,5');
  const lastWagon = page.locator('[data-object-id]').filter({ has: page.locator('rect') }).last();
  assert.match(await lastWagon.getAttribute('transform'), /rotate\(37.5\)/);
  const handle = await page.getByTestId('rotation-handle').boundingBox();
  const center = await world(574, 310);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(center.x + 55, center.y, { steps: 12 }); await page.mouse.up();
  assert.ok(Math.abs(Number((await page.getByRole('textbox', { name: 'Угол поворота', exact: true }).inputValue()).replace(',', '.')) - 90) < .1);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Угол поворота', exact: true })).toHaveValue('37,5');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await page.keyboard.press('Control+d'); await expect(page.locator('[data-object-id]')).toHaveCount(12);
  await page.keyboard.press('Delete'); await expect(page.locator('[data-object-id]')).toHaveCount(11);
  await page.keyboard.press('Control+z'); await expect(page.locator('[data-object-id]')).toHaveCount(12);
  await page.keyboard.press('Control+y'); await expect(page.locator('[data-object-id]')).toHaveCount(11);
  log('all nine colors, numeric and mouse rotation, one-step undo, duplicate and delete');

  await field('Длина вагона', '30,5'); await field('Ширина вагона', '11'); await field('Диаметр города', '12');
  const changed = await readProject();
  assert.equal(changed.sizes.wagonLength, 30.5); assert.ok(Math.abs(changed.objects[0].x - 160) < .001);
  await field('Длина поля', 400); assert.equal(await page.locator('[data-object-id]').count(), 11);
  await field('Длина поля', 785);
  const workspace = await page.getByTestId('board').boundingBox();
  await page.mouse.move(workspace.x + workspace.width / 2, workspace.y + workspace.height / 2);
  const previous = await page.locator('.board-svg > g').getAttribute('transform');
  await page.mouse.wheel(0, -200); await page.waitForTimeout(100);
  assert.notEqual(await page.locator('.board-svg > g').getAttribute('transform'), previous);
  await page.keyboard.down('Space'); await page.mouse.down(); await page.mouse.move(workspace.x + workspace.width / 2 + 40, workspace.y + workspace.height / 2 + 30, { steps: 5 }); await page.mouse.up(); await page.keyboard.up('Space');
  await page.getByRole('button', { name: 'Показать поле целиком', exact: true }).click();
  log('global dimensions, board resizing without object loss, zoom and pan');

  const bg = new PNG({ width: 320, height: 200 });
  for (let y = 0; y < bg.height; y++) for (let x = 0; x < bg.width; x++) {
    const i = (y * bg.width + x) * 4;
    bg.data.set(x % 40 < 2 || y % 40 < 2 ? [211, 224, 214, 255] : [239, 246, 237, 255], i);
  }
  await writeFile(backgroundFile, PNG.sync.write(bg)); await setOpen(backgroundFile);
  await page.getByRole('button', { name: 'Загрузить PNG / JPEG', exact: true }).click(); await idle();
  await field('Непрозрачность', 65); await field('Масштаб к полю', 95);
  await page.getByRole('button', { name: 'Переместить подложку', exact: true }).click();
  const bgStart = await world(350, 200), bgEnd = await world(370, 210);
  await page.mouse.move(bgStart.x, bgStart.y); await page.mouse.down(); await page.mouse.move(bgEnd.x, bgEnd.y, { steps: 5 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Завершить перемещение', exact: true }).click();
  const beforeSave = await readProject();
  assert.equal(beforeSave.sizes.cityLabelFontSize, 5);
  assert.equal(beforeSave.objects.find(o => o.name === 'Москва').markerStyle, 'sapphire');
  assert.equal(beforeSave.objects.find(o => o.name === 'Санкт-Петербург').markerStyle, 'azure');
  assert.ok(beforeSave.objects.filter(o => o.type === 'city').every(o => !Object.hasOwn(o, 'labelFontSize')));
  assert.equal(beforeSave.background.opacity, .65); assert.ok(beforeSave.background.dataUrl.startsWith('data:image/png;base64,'));
  const copied = path.join(out, 'Перенесённый проект.ttrmap.json');
  const legacy = structuredClone(beforeSave);
  legacy.objects.find(o => o.name === 'Санкт-Петербург').labelFontSize = 9;
  await writeFile(copied, JSON.stringify(legacy));
  await page.getByRole('button', { name: 'Новый', exact: true }).click(); await idle(); assert.equal(await page.locator('[data-object-id]').count(), 0);
  await setOpen(copied); await page.getByRole('button', { name: 'Открыть', exact: true }).click(); await idle();
  assert.equal(await page.locator('[data-object-id]').count(), 11);
  await expectLabelSize('5');
  await expect(markerFor('Москва')).toHaveAttribute('href', '#city-marker-sapphire');
  await expect(markerFor('Санкт-Петербург')).toHaveAttribute('href', '#city-marker-azure');
  await fontSize.fill('7');
  await expectLabelSize('7');
  await fontSize.press('Escape');
  await expectLabelSize('5');
  // Save uses the reopened path, not the mocked Save As path.
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await idle();
  const restored = JSON.parse(await readFile(copied, 'utf8')); assert.deepEqual(restored, beforeSave);
  log('embedded background, opacity, scale, movement, save and reopen portable JSON');

  await exportAs('svg', svgFile);
  const svg = await readFile(svgFile, 'utf8'); assert.match(svg, /width="785mm"/); assert.ok(svg.includes('Санкт-Петербург')); assert.ok(svg.includes('data:image/png;base64,')); assert.ok(!svg.includes('data-object-id'));
  assert.match(svg, /<text [^>]*font-size="5"[^>]*>Москва<\/text>/);
  assert.match(svg, /<text [^>]*font-size="5"[^>]*>Санкт-Петербург<\/text>/);
  assert.match(svg, /<text [^>]*font-family="Georgia, serif"[^>]*font-weight="700" fill="#503b34" stroke="#fff7e5"/);
  await exportAs('png', pngFile, 300);
  const output = await readFile(pngFile), decoded = PNG.sync.read(output);
  assert.equal(decoded.width, 9272); assert.equal(decoded.height, 6201);
  function centerRGB(cityName) {
    const city = beforeSave.objects.find(object => object.name === cityName);
    assert.ok(svg.includes('href="#city-marker-' + city.markerStyle + '"'));
    const px = Math.round(city.x * decoded.width / beforeSave.board.width);
    const py = Math.round(city.y * decoded.height / beforeSave.board.height);
    const offset = 4 * (py * decoded.width + px);
    return decoded.data.subarray(offset, offset + 3);
  }
  const sapphire = centerRGB('Москва'), azure = centerRGB('Санкт-Петербург');
  assert.ok(sapphire[2] > sapphire[0] + 40 && azure[2] > azure[0] + 40);
  assert.ok(azure[1] > sapphire[1] + 30, 'PNG should show different blue shades at the two city centres');
  let ppm = 0;
  for (let at = 8; at < output.length;) { const length = output.readUInt32BE(at); if (output.toString('ascii', at + 4, at + 8) === 'pHYs') ppm = output.readUInt32BE(at + 8); at += length + 12; }
  assert.equal(ppm, 11811);
  await page.locator('.inspector-scroll').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: path.join(out, '02-editor.png') });
  log('SVG and full-resolution 300 DPI PNG through export dialog');

  const invalid = path.join(out, 'invalid.json'); await writeFile(invalid, '{"format":"ttr-map","version":99}');
  await setOpen(invalid); await page.getByRole('button', { name: 'Открыть', exact: true }).click(); await idle();
  assert.equal(await page.locator('[data-object-id]').count(), 11); assert.equal(await page.getByRole('alert').count(), 1);
  await page.getByRole('button', { name: 'Скрыть уведомление' }).click();
  await field('Длина вагона', 31); await confirm(2);
  await page.getByRole('button', { name: 'Новый', exact: true }).click(); await idle(); assert.equal(await page.locator('[data-object-id]').count(), 11);
  await confirm(0); await setSave(null);
  await page.getByRole('button', { name: 'Сохранить как', exact: true }).click(); await idle();
  assert.ok((await page.title()).startsWith('•'));
  await confirm(1); await page.getByRole('button', { name: 'Новый', exact: true }).click(); await idle(); assert.equal(await page.locator('[data-object-id]').count(), 0);
  log('invalid files, unsaved changes confirmation, cancelled save, discard');
  const greenStyles = [
    { city: 'Пермь', label: 'Фисташка', style: 'pistachio', x: 120, rgb: [189, 202, 145] },
    { city: 'Тула', label: 'Мята', style: 'mint', x: 280, rgb: [153, 210, 180] },
    { city: 'Псков', label: 'Эвкалипт', style: 'eucalyptus', x: 440, rgb: [138, 186, 172] },
    { city: 'Киров', label: 'Изумруд', style: 'emerald', x: 600, rgb: [83, 157, 125] },
  ];
  await page.getByRole('button', { name: 'Город', exact: true }).click();
  for (const { city, label, x } of greenStyles) {
    await newMarker.getByRole('button', { name: label, exact: true }).click();
    await clickWorld(x, 250); await field('Название города', city);
  }
  await page.getByRole('button', { name: 'Выделение', exact: true }).click();
  await clickWorld(600, 250);
  await chosenMarker.getByRole('button', { name: 'Мята', exact: true }).click();
  await expect(markerFor('Киров')).toHaveAttribute('href', '#city-marker-mint');
  await expect(markerFor('Пермь')).toHaveAttribute('href', '#city-marker-pistachio');
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  const greenFile = path.join(out, 'Зелёные города.ttrmap.json');
  await setSave(greenFile); await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await idle();
  await page.getByRole('button', { name: 'Новый', exact: true }).click(); await idle();
  await setOpen(greenFile); await page.getByRole('button', { name: 'Открыть', exact: true }).click(); await idle();
  await exportAs('svg', path.join(out, 'green.svg'));
  await exportAs('png', path.join(out, 'green.png'), 96);
  const greenSvg = await readFile(path.join(out, 'green.svg'), 'utf8');
  const greenPng = PNG.sync.read(await readFile(path.join(out, 'green.png')));
  for (const { city, style, x, rgb } of greenStyles) {
    await expect(markerFor(city)).toHaveAttribute('href', '#city-marker-' + style);
    assert.ok(greenSvg.includes('href="#city-marker-' + style + '"'));
    const pixel = 4 * (Math.round(250 * greenPng.height / 525) * greenPng.width + Math.round(x * greenPng.width / 785));
    rgb.forEach((channel, i) => assert.ok(Math.abs(greenPng.data[pixel + i] - channel) < 8, city + ' PNG colour'));
  }
  log('four green city styles retain their individual appearance after editing, reopening, and SVG/PNG export');
  assert.deepEqual(errors, []); log('no renderer exceptions');
  await writeFile(path.join(out, 'smoke-report.json'), JSON.stringify({ passed: true, rendererErrors: errors, png: { width: decoded.width, height: decoded.height, dpi: 300, pixelsPerMetre: ppm }, objects: beforeSave.objects.length }, null, 2));
} catch (error) {
  await writeFile(path.join(out, 'pointer-trace.json'), JSON.stringify(await page.evaluate(() => globalThis.pointerTrace), null, 2)).catch(() => {});
  await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close();
  await server?.close();
}
