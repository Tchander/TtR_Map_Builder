import { describe, expect, it } from 'vitest';
import { createProject, parseProject, parseProjectText, serializeProject, type Project, type Wagon } from '../src/model';
import { allConnections, cityPoint, complete, connect, connectionPoints, disconnect, freePort, generateArc, generateParallel, insertGenerated, pairCount, portPoint, removeObject, reverseRoute, routeConnections, wagonsOverlap, type Anchor } from '../src/routes';
import { exportSvg } from '../src/scene';
import { commit, initialHistory, redo, undo } from '../src/history';

const city = (cityId: string): Anchor => ({ kind: 'city', cityId });
const port = (wagonId: string, side: 'minus' | 'plus'): Anchor => ({ kind: 'port', wagonId, side });
function setup(): Project {
  return { ...createProject(), objects: [
    { type: 'city', id: 'A', x: 100, y: 200, name: 'Альфа', labelOffset: { x: 8, y: -7 } },
    { type: 'city', id: 'B', x: 500, y: 200, name: 'Бета', labelOffset: { x: 8, y: -7 } },
    ...Array.from({ length: 6 }, (_, i): Wagon => ({ type: 'wagon', id: `w${i}`, x: 160 + i * 50, y: 200, angle: 0, color: 'gray' })),
  ] };
}
function chain(p = setup()) {
  p = connect(p, city('A'), port('w0', 'minus'));
  p = connect(p, port('w0', 'plus'), port('w1', 'minus'));
  return connect(p, port('w1', 'plus'), city('B'));
}
describe('route topology', () => {
  it('assembles a chain in either direction with explicit ports', () => {
    let p = setup();
    p = connect(p, port('w1', 'minus'), port('w0', 'plus'));
    p = connect(p, city('B'), port('w1', 'plus'));
    p = connect(p, port('w0', 'minus'), city('A'));
    expect(p.routes).toHaveLength(1); expect(complete(p.routes[0])).toBe(true);
    expect(allConnections(p)).toHaveLength(3);
    expect(pairCount(p, 'A', 'B')).toBe(1);
    expect(reverseRoute(reverseRoute(p.routes[0]))).toEqual(p.routes[0]);
  });
  it('merges reversed partial chains, preserving hidden state', () => {
    let p = setup();
    p = connect(p, city('A'), port('w0', 'plus'));
    p = connect(p, city('B'), port('w1', 'plus'));
    p.routes[1].showConnections = false;
    p = connect(p, port('w0', 'minus'), port('w1', 'minus'));
    expect(p.routes).toHaveLength(1); expect(complete(p.routes[0])).toBe(true);
    expect(p.routes[0].showConnections).toBe(false);
    expect(p.routes[0].wagons.map(w => w.entry)).toEqual(['plus', 'minus']);
  });
  it('rejects occupied ports, missing objects, loops and direct city links', () => {
    const p = connect(setup(), port('w0', 'plus'), port('w1', 'minus'));
    expect(() => connect(p, port('w0', 'plus'), port('w2', 'minus'))).toThrow('занят');
    expect(() => connect(p, port('w0', 'minus'), port('w1', 'plus'))).toThrow('цикл');
    expect(() => connect(p, port('w2', 'minus'), port('w2', 'plus'))).toThrow('собой');
    expect(() => connect(p, city('A'), city('B'))).toThrow('вагон');
    expect(() => connect(p, city('A'), port('missing', 'minus'))).toThrow();
    const q = connect(p, city('A'), port('w0', 'minus'));
    expect(() => connect(q, port('w1', 'plus'), city('A'))).toThrow('разные города');
  });
  it('rejects third route without changing the unfinished chain', () => {
    let p = chain();
    p = connect(p, city('B'), port('w2', 'minus'));
    p = connect(p, port('w2', 'plus'), city('A'));
    p = connect(p, city('A'), port('w3', 'minus'));
    const before = serializeProject(p);
    expect(() => connect(p, port('w3', 'plus'), city('B'))).toThrow('максимум два');
    expect(serializeProject(p)).toBe(before); expect(pairCount(p, 'B', 'A')).toBe(2);
    expect(p.routes.filter(r => !complete(r))).toHaveLength(1);
  });
  it('splits links, detaches cities and releases lone unconnected wagons', () => {
    const p = chain(); p.routes[0].showConnections = false;
    const split = disconnect(p, p.routes[0].id, 1);
    expect(split.routes).toHaveLength(2); expect(split.routes.every(r => !complete(r) && !r.showConnections)).toBe(true);
    expect(freePort(split, port('w0', 'plus'))).toBe(true);
    expect(freePort(split, port('w1', 'minus'))).toBe(true);
    const withoutCity = removeObject(split, 'A');
    expect(withoutCity.routes).toHaveLength(1); expect(withoutCity.objects.some(o => o.id === 'w0')).toBe(true);
    expect(removeObject(withoutCity, 'w1').routes).toHaveLength(0);
    const end = disconnect(p, p.routes[0].id, 2);
    expect(end.routes[0].endCityId).toBeNull();
  });
  it('removes a middle wagon leaving two valid pieces', () => {
    let p = setup(); p = connect(p, city('A'), port('w0', 'minus'));
    p = connect(p, port('w0', 'plus'), port('w1', 'minus'));
    p = connect(p, port('w1', 'plus'), port('w2', 'minus'));
    p = connect(p, port('w2', 'plus'), city('B'));
    const next = removeObject(p, 'w1');
    expect(next.routes).toHaveLength(2); expect(allConnections(next)).toHaveLength(2);
    expect(() => parseProject(next)).not.toThrow();
  });
  it('records whole generation and split as single reversible actions', () => {
    const p = setup(), generated = insertGenerated(p, generateArc(p, 'A', 'B', 3, { x: 300, y: 270 }, 'red'));
    const h = commit(initialHistory(p), generated);
    expect(undo(h).present).toBe(p); expect(redo(undo(h)).present).toBe(generated);
    const split = disconnect(generated, generated.routes[0].id, 1);
    expect(undo(commit(h, split)).present).toBe(generated);
  });
});
describe('route geometry and export', () => {
  it.each([0, 90, 137.5, 270])('anchors both outer short sides at %s degrees', angle => {
    const w: Wagon = { type: 'wagon', id: 'w', x: 20, y: 30, angle, color: 'blue' };
    const a = portPoint(w, 'minus', 26), b = portPoint(w, 'plus', 26);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(26);
    expect((a.x + b.x) / 2).toBeCloseTo(20); expect((a.y + b.y) / 2).toBeCloseTo(30);
  });
  it('uses city outer radius and handles coincident coordinates', () => {
    expect(cityPoint({ x: 10, y: 20 }, { x: 10, y: 20 }, 10)).toEqual({ x: 15, y: 20 });
    const point = cityPoint({ x: 0, y: 0 }, { x: 3, y: 4 }, 20);
    expect(point).toEqual({ x: 6, y: 8 });
  });
  it('recomputes connections after moving, rotating and resizing objects', () => {
    const p = chain(), link = routeConnections(p.routes[0])[0];
    expect(connectionPoints(p, link)).toEqual([{ x: 105, y: 200 }, { x: 147, y: 200 }]);
    const w = p.objects.find(o => o.id === 'w0') as Wagon; w.angle = 90; w.y = 240;
    p.sizes.wagonLength = 40; p.sizes.cityDiameter = 20;
    const [a, b] = connectionPoints(p, link);
    expect(b.x).toBeCloseTo(160); expect(b.y).toBeCloseTo(220);
    expect(Math.hypot(a.x - 100, a.y - 200)).toBeCloseTo(10);
  });
  it('exports real connectors only and respects visibility', () => {
    const p = chain(), svg = exportSvg(p);
    expect(svg.match(/<line /g)).toHaveLength(3); expect(svg).toContain('stroke-width="0.3"');
    const firstWagon = svg.search(/<g transform="translate\([^)]+\) rotate\(/);
    expect(svg.lastIndexOf('<line ')).toBeLessThan(firstWagon);
    expect(svg).not.toMatch(/data-connection|data-port|curve-guide/);
    p.routes[0].showConnections = false; expect(exportSvg(p)).not.toContain('<line ');
  });
});
describe('automatic layouts', () => {
  it('lays out one or several fixed-size wagons along straight and bent arcs', () => {
    const p = setup();
    const straight = generateArc(p, 'A', 'B', 3, { x: 300, y: 200 }, 'red');
    expect(straight.wagons.every(w => w.angle === 0 && w.y === 200)).toBe(true);
    expect(straight.wagons[1].x).toBeCloseTo(300);
    const arc = generateArc(p, 'A', 'B', 3, { x: 300, y: 350 }, 'blue');
    expect(arc.wagons[1].y).toBeCloseTo(275); expect(arc.wagons[0].angle).toBeGreaterThan(0);
    expect(generateArc(p, 'A', 'B', 1, { x: 300, y: 200 }, 'gray').wagons).toHaveLength(1);
  });
  it('accepts an exact fit with 2 mm gaps at wagons and cities', () => {
    const p = setup(); p.objects.find(o => o.id === 'B')!.x = 196;
    const generated = generateArc(p, 'A', 'B', 3, { x: 148, y: 200 }, 'red');
    generated.wagons.forEach((w, i) => expect(w.x).toBeCloseTo(120 + i * 28, 6));
  });
  it('handles strong bends and rejects a layout that folds onto itself', () => {
    const p = setup();
    const bent = generateArc(p, 'A', 'B', 8, { x: 300, y: 1500 }, 'blue');
    expect(bent.wagons).toHaveLength(8);
    expect(bent.wagons.every(w => Number.isFinite(w.angle) && Number.isFinite(w.x) && Number.isFinite(w.y))).toBe(true);
    expect(() => generateArc(p, 'A', 'B', 20, { x: -500, y: 200 }, 'red')).toThrow(/пересека/);
  });
  it('rejects no room, fractional counts and coincident cities', () => {
    const p = setup();
    expect(() => generateArc(p, 'A', 'B', 50, { x: 300, y: 200 }, 'red')).toThrow('не помещаются');
    expect(() => generateArc(p, 'A', 'B', 1.5, { x: 300, y: 200 }, 'red')).toThrow('целым');
    expect(() => generateArc(p, 'A', 'A', 3, { x: 300, y: 200 }, 'red')).toThrow('разных');
    const b = p.objects.find(o => o.id === 'B')!; b.x = 100;
    expect(() => generateArc(p, 'A', 'B', 3, { x: 300, y: 200 }, 'red')).toThrow('совпадают');
  });
  it('copies route along traversal normals, validates collisions and enforces the pair limit', () => {
    let p = setup(); p = insertGenerated(p, generateArc(p, 'A', 'B', 3, { x: 300, y: 200 }, 'red'));
    const source = p.routes[0], copy = generateParallel(p, source.id, 4, 1, 'blue');
    expect(copy.wagons[0].y).toBe(213);
    const reversed = { ...p, routes: [reverseRoute(source)] };
    expect(generateParallel(reversed, source.id, 4, -1, 'blue').wagons[0].y).toBeCloseTo(213);
    p = insertGenerated(p, copy); expect(pairCount(p, 'A', 'B')).toBe(2);
    expect(() => generateParallel(p, source.id, 4, 1, 'red')).toThrow('два маршрута');
    expect(() => generateArc(p, 'B', 'A', 3, { x: 300, y: 250 }, 'red')).toThrow('два маршрута');
    const a = copy.wagons[0]; expect(wagonsOverlap(a, { ...a, x: a.x + 1 }, p.sizes)).toBe(true);
  });
  it('rejects a parallel copy intersecting a different wagon in its source chain', () => {
    const p = chain(), wagon = p.objects.find(o => o.id === 'w1')!;
    wagon.x = 160; wagon.y = 213;
    expect(() => generateParallel(p, p.routes[0].id, 4, 1, 'red')).toThrow('пересекаются');
  });
});
describe('project version 2', () => {
  it('migrates version 1 without changing its objects or background', () => {
    const p = setup(), { routes: _routes, ...base } = p;
    const converted = parseProject({ ...base, version: 1 });
    expect(converted).toEqual({ ...p, routes: [], version: 2 });
    expect(parseProjectText(serializeProject(converted))).toEqual(converted);
  });
  it('round-trips incomplete chains, orientation and hidden connectors', () => {
    const p = connect(setup(), port('w0', 'minus'), port('w1', 'plus'));
    p.routes[0].showConnections = false;
    expect(parseProjectText(serializeProject(p))).toEqual(p);
  });
  it('rejects bad references, duplicate membership, route IDs and same-city endpoints', () => {
    const p = chain();
    expect(() => parseProject({ ...p, routes: [{ ...p.routes[0], startCityId: 'missing' }] })).toThrow('город');
    expect(() => parseProject({ ...p, routes: [{ ...p.routes[0], wagons: [{ wagonId: 'A', entry: 'minus' }] }] })).toThrow('вагон');
    expect(() => parseProject({ ...p, routes: [p.routes[0], p.routes[0]] })).toThrow();
    expect(() => parseProject({ ...p, routes: [{ ...p.routes[0], endCityId: 'A' }] })).toThrow('разные города');
    expect(() => parseProject({ ...p, routes: [{ ...p.routes[0], wagons: [...p.routes[0].wagons, p.routes[0].wagons[0]] }] })).toThrow('один раз');
  });
});
