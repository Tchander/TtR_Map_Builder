import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { createProject, fitBackground, fitCamera, normalizeAngle, parseProject, parseProjectText, rotate, screenToWorld, serializeProject, worldToScreen, zoomAt, type Project } from '../src/model';
import { exportSvg, objectMarkup } from '../src/scene';
import { crc32, pngDimensions, withPngDpi } from '../src/png';
import { commit, initialHistory, redo, undo } from '../src/history';

function example(): Project {
  return { ...createProject(), objects: [
    { id: 'city-1', type: 'city', x: 45.125, y: 80, name: 'Санкт-Петербург & <город>', labelOffset: { x: 8, y: -7 } },
    { id: 'wagon-1', type: 'wagon', x: 110, y: 80, angle: 359.9, color: 'pink' },
  ] };
}
describe('project data', () => {
  it('has the requested physical defaults', () => {
    expect(createProject()).toMatchObject({ board: { width: 785, height: 525 }, sizes: { wagonLength: 26, wagonWidth: 9, cityDiameter: 10 }, objects: [], background: null });
  });
  it('round-trips Cyrillic, fractional positions, rotations and an embedded background', () => {
    const p = example();
    const image = PNG.sync.write(new PNG({ width: 4, height: 3 }));
    p.background = fitBackground({ dataUrl: `data:image/png;base64,${image.toString('base64')}`, name: 'Карта.png', pixelWidth: 4, pixelHeight: 3 }, p.board);
    expect(parseProjectText(serializeProject(p))).toEqual(p);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid dimensions: %s', value => {
    const p = createProject(); p.sizes.cityDiameter = value;
    expect(() => parseProject(p)).toThrow('Некорректный проект');
  });
  it('rejects unknown versions, malformed JSON, duplicates and unsafe image formats', () => {
    expect(() => parseProject({ ...createProject(), version: 99 })).toThrow('версия');
    expect(() => parseProjectText('{bad}')).toThrow('JSON');
    const p = example(); p.objects.push(p.objects[0]);
    expect(() => parseProject(p)).toThrow();
    expect(() => parseProject({ ...createProject(), background: { dataUrl: 'data:image/svg+xml,<svg/>' } })).toThrow();
  });
  it('accepts externally generated ids and normalizes complete rotations', () => {
    const p = example(); if (p.objects[1].type === 'wagon') p.objects[1].angle = -450;
    expect(parseProject(p).objects[1]).toHaveProperty('angle', 270);
    expect(normalizeAngle(360)).toBe(0);
  });
  it('loads a colored tunnel and normalizes a locomotive to gray in an external project', () => {
    const p = example();
    const wagon = p.objects[1];
    const objects = [
      { ...wagon, kind: 'locomotive', color: 'red' },
      { ...wagon, id: 'second', kind: 'tunnel', color: 'black' },
    ];
    const restored = parseProject({ ...p, objects });
    expect(restored.objects).toMatchObject([{ kind: 'locomotive', color: 'gray' }, { kind: 'tunnel', color: 'black' }]);
    expect(parseProjectText(serializeProject(restored))).toEqual(restored);
    expect(() => parseProject({ ...p, objects: [{ ...wagon, kind: 'invalid' }] })).toThrow();
  });
});
describe('geometry and camera', () => {
  it('rotates around the center correctly', () => {
    const p = rotate({ x: 13, y: 4.5 }, 90);
    expect(p.x).toBeCloseTo(-4.5); expect(p.y).toBeCloseTo(13);
    expect(rotate({ x: 13, y: 0 }, 180).x).toBeCloseTo(-13);
  });
  it('keeps the cursor anchor when zooming, and converts screen/world both ways', () => {
    const camera = { x: 70, y: -30, scale: 2.5 }, cursor = { x: 400, y: 250 };
    const world = screenToWorld(cursor, camera), zoomed = zoomAt(camera, cursor, 7);
    expect(screenToWorld(cursor, zoomed)).toEqual(world);
    expect(worldToScreen(world, zoomed)).toEqual(cursor);
  });
  it('fits the board and image with margins and preserved aspect ratio', () => {
    const p = createProject(), cam = fitCamera(900, 700, p.board);
    expect(cam.x).toBeGreaterThanOrEqual(48); expect(cam.y).toBeGreaterThanOrEqual(50);
    const bg = fitBackground({ dataUrl: '', name: '', pixelWidth: 1600, pixelHeight: 900 }, p.board);
    expect(bg.width / bg.height).toBeCloseTo(16 / 9); expect(bg.width).toBe(785); expect(bg.y).toBeGreaterThan(0);
  });
});
describe('SVG physical output', () => {
  it('exports physical dimensions and viewBox without editor controls', () => {
    const svg = exportSvg(example());
    expect(svg).toContain('width="785mm" height="525mm" viewBox="0 0 785 525"');
    expect(svg).toContain('clip-path="url(#board)"');
    expect(svg).not.toMatch(/data-object|data-rotate|selection|рабочее поле/i);
    expect(svg).toContain('rotate(359.9)');
    expect(svg).toContain('Санкт-Петербург &amp; &lt;город&gt;');
  });
  it('accounts for stroke in outer wagon and city sizes', () => {
    const p = example();
    const wagon = objectMarkup(p.objects[1], p.sizes);
    expect(wagon).toContain('width="25.55" height="8.55"');
    expect(wagon).toContain('stroke-width="0.45"');
    expect(objectMarkup(p.objects[0], p.sizes)).toContain('r="4.75"');
  });
  it('embeds an included background and respects visibility and export toggle', () => {
    const p = createProject(); p.background = fitBackground({ dataUrl: 'data:image/png;base64,AAAA', name: 'map', pixelWidth: 2, pixelHeight: 1 }, p.board);
    expect(exportSvg(p)).toContain('<image'); expect(exportSvg(p, false)).not.toContain('<image');
    p.background.visible = false; expect(exportSvg(p)).not.toContain('<image');
  });
  it('escapes text and identifiers instead of injecting XML markup', () => {
    const p = example(); p.objects[0].id = '"><script>alert(1)</script>';
    if (p.objects[0].type === 'city') p.objects[0].name = '\u0000<image href="https://example.com"/>';
    const result = objectMarkup(p.objects[0], p.sizes, true);
    expect(result).not.toContain('<script>'); expect(result).not.toContain('<image '); expect(result).not.toContain('\u0000');
  });
});
describe('PNG print output', () => {
  it('calculates the default 300 DPI pixel size and guards oversized canvases', () => {
    expect(pngDimensions(785, 525, 300)).toEqual({ width: 9272, height: 6201 });
    expect(() => pngDimensions(2000, 2000, 300)).toThrow('Уменьшите DPI');
    expect(() => pngDimensions(1000, 1000, 300)).toThrow('100 Мп');
  });
  it('writes and replaces pHYs, uses metres and preserves pixel data', () => {
    const p = new PNG({ width: 3, height: 2 }); p.data.fill(180);
    const original = PNG.sync.write(p);
    const density = withPngDpi(withPngDpi(original, 96), 300);
    expect(PNG.sync.read(Buffer.from(density)).data).toEqual(p.data);
    const chunks: { type: string; data: Uint8Array }[] = [];
    const view = new DataView(density.buffer);
    for (let offset = 8; offset < density.length;) {
      const length = view.getUint32(offset);
      const chunk = density.subarray(offset + 4, offset + 8 + length);
      expect(view.getUint32(offset + 8 + length)).toBe(crc32(chunk));
      chunks.push({ type: String.fromCharCode(...chunk.subarray(0, 4)), data: chunk.subarray(4) });
      offset += length + 12;
    }
    const physical = chunks.filter(c => c.type === 'pHYs'); expect(physical).toHaveLength(1);
    const d = new DataView(physical[0].data.buffer, physical[0].data.byteOffset);
    expect(d.getUint32(0)).toBe(11811); expect(d.getUint32(4)).toBe(11811); expect(d.getUint8(8)).toBe(1);
  });
});
describe('history', () => {
  it('records a full drag as one undoable action and clears redo on edits', () => {
    const start = example(), end = { ...start, objects: start.objects.map(o => ({ ...o, x: o.x + 30 })) };
    const h = commit({ ...initialHistory(start), present: end }, end, start);
    expect(h.past).toHaveLength(1); expect(undo(h).present).toBe(start); expect(redo(undo(h)).present).toBe(end);
    expect(commit(undo(h), createProject()).future).toHaveLength(0);
  });
  it('does not create history or dirty changes for a no-op gesture', () => {
    const start = example(), h = commit(initialHistory(start), structuredClone(start));
    expect(h.past).toHaveLength(0); expect(h.present).toBe(start);
  });
});
