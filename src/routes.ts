import { normalizeAngle, parseProject, rotate, type City, type Color, type Point, type Port, type Project, type Route, type Wagon } from './model';

export type Anchor = { kind: 'city'; cityId: string } | { kind: 'port'; wagonId: string; side: Port };
export interface Connection { routeId: string; slot: number; a: Anchor; b: Anchor }
export const opposite = (side: Port): Port => side === 'minus' ? 'plus' : 'minus';
export const sameAnchor = (a: Anchor, b: Anchor) => a.kind === 'city' && b.kind === 'city' ? a.cityId === b.cityId : a.kind === 'port' && b.kind === 'port' && a.wagonId === b.wagonId && a.side === b.side;
const port = (wagonId: string, side: Port): Anchor => ({ kind: 'port', wagonId, side });
export const complete = (r: Route) => !!r.startCityId && !!r.endCityId;
export function pairCount(p: Project, a: string, b: string) {
  return p.routes.filter(r => (r.startCityId === a && r.endCityId === b) || (r.startCityId === b && r.endCityId === a)).length;
}
export function routeConnections(route: Route): Connection[] {
  const result: Connection[] = [];
  const add = (slot: number, a: Anchor, b: Anchor) => result.push({ routeId: route.id, slot, a, b });
  const first = route.wagons[0], last = route.wagons.at(-1)!;
  if (route.startCityId) add(0, { kind: 'city', cityId: route.startCityId }, port(first.wagonId, first.entry));
  for (let i = 1; i < route.wagons.length; i++) add(i, port(route.wagons[i - 1].wagonId, opposite(route.wagons[i - 1].entry)), port(route.wagons[i].wagonId, route.wagons[i].entry));
  if (route.endCityId) add(route.wagons.length, port(last.wagonId, opposite(last.entry)), { kind: 'city', cityId: route.endCityId });
  return result;
}
export const allConnections = (p: Project) => p.routes.flatMap(routeConnections);
export function freePort(p: Project, anchor: Anchor): boolean {
  if (anchor.kind === 'city') return p.objects.some(o => o.id === anchor.cityId && o.type === 'city');
  return p.objects.some(o => o.id === anchor.wagonId && o.type === 'wagon') && !allConnections(p).some(c => sameAnchor(c.a, anchor) || sameAnchor(c.b, anchor));
}
export function reverseRoute(route: Route): Route {
  return { ...route, startCityId: route.endCityId, endCityId: route.startCityId, wagons: [...route.wagons].reverse().map(w => ({ ...w, entry: opposite(w.entry) })) };
}
function oriented(p: Project, anchor: Extract<Anchor, { kind: 'port' }>, atEnd: boolean): Route {
  if (!freePort(p, anchor)) throw new Error('Этот торец уже занят соединением.');
  let route = p.routes.find(r => r.wagons.some(w => w.wagonId === anchor.wagonId)) ?? {
    id: crypto.randomUUID(), startCityId: null, endCityId: null, wagons: [{ wagonId: anchor.wagonId, entry: anchor.side }], showConnections: true,
  };
  const first = route.wagons[0];
  const isStart = first.wagonId === anchor.wagonId && first.entry === anchor.side;
  if (isStart === atEnd) route = reverseRoute(route);
  return route;
}
export function connect(p: Project, a: Anchor, b: Anchor): Project {
  if (a.kind === 'city' && b.kind === 'city') throw new Error('Добавьте хотя бы один вагон между городами.');
  if (!freePort(p, a) || !freePort(p, b)) throw new Error('Этот торец уже занят или объект отсутствует.');
  if (a.kind === 'port' && b.kind === 'port' && a.wagonId === b.wagonId) throw new Error('Нельзя соединять вагон с самим собой.');
  let route: Route, removed: string[];
  if (a.kind === 'city' && b.kind === 'port') {
    const r = oriented(p, b, false); route = { ...r, startCityId: a.cityId }; removed = [r.id];
  } else if (a.kind === 'port' && b.kind === 'city') {
    const r = oriented(p, a, true); route = { ...r, endCityId: b.cityId }; removed = [r.id];
  } else {
    const left = oriented(p, a as Extract<Anchor, { kind: 'port' }>, true);
    const right = oriented(p, b as Extract<Anchor, { kind: 'port' }>, false);
    if (left.id === right.id) throw new Error('Нельзя замкнуть цепочку в цикл.');
    route = { ...left, endCityId: right.endCityId, wagons: [...left.wagons, ...right.wagons], showConnections: left.showConnections && right.showConnections };
    removed = [left.id, right.id];
  }
  const candidate = { ...p, routes: [...p.routes.filter(r => !removed.includes(r.id)), route] };
  parseProject(candidate); // Shared validation for UI, generators and file loading.
  return candidate;
}
export function connectionError(p: Project, a: Anchor, b: Anchor): string | null {
  try { connect(p, a, b); return null; } catch (error) { return (error as Error).message; }
}
const meaningful = (r: Route) => r.wagons.length > 0 && (r.wagons.length > 1 || !!r.startCityId || !!r.endCityId);
export function disconnect(p: Project, routeId: string, slot: number): Project {
  const r = p.routes.find(r => r.id === routeId);
  if (!r) return p;
  let pieces: Route[];
  if (slot === 0) pieces = [{ ...r, startCityId: null }];
  else if (slot === r.wagons.length) pieces = [{ ...r, endCityId: null }];
  else if (slot > 0 && slot < r.wagons.length) pieces = [
    { ...r, endCityId: null, wagons: r.wagons.slice(0, slot) },
    { ...r, id: crypto.randomUUID(), startCityId: null, wagons: r.wagons.slice(slot) },
  ]; else return p;
  return { ...p, routes: p.routes.flatMap(route => route.id === r.id ? pieces.filter(meaningful) : [route]) };
}
export function removeObject(p: Project, id: string): Project {
  const routes = p.routes.flatMap(r => {
    const index = r.wagons.findIndex(w => w.wagonId === id);
    if (index >= 0) return [
      { ...r, endCityId: null, wagons: r.wagons.slice(0, index) },
      { ...r, id: crypto.randomUUID(), startCityId: null, wagons: r.wagons.slice(index + 1) },
    ].filter(meaningful);
    const result = { ...r, startCityId: r.startCityId === id ? null : r.startCityId, endCityId: r.endCityId === id ? null : r.endCityId };
    return meaningful(result) ? [result] : [];
  });
  return { ...p, objects: p.objects.filter(o => o.id !== id), routes };
}
export function portPoint(wagon: Wagon, side: Port, length: number): Point {
  const delta = rotate({ x: (side === 'minus' ? -1 : 1) * length / 2, y: 0 }, wagon.angle);
  return { x: wagon.x + delta.x, y: wagon.y + delta.y };
}
export function cityPoint(city: Point, toward: Point, diameter: number): Point {
  const dx = toward.x - city.x, dy = toward.y - city.y, distance = Math.hypot(dx, dy);
  return distance < 1e-9 ? { x: city.x + diameter / 2, y: city.y } : { x: city.x + dx / distance * diameter / 2, y: city.y + dy / distance * diameter / 2 };
}
export function anchorPoint(p: Project, anchor: Anchor, toward?: Point): Point {
  const object = p.objects.find(o => o.id === (anchor.kind === 'city' ? anchor.cityId : anchor.wagonId))!;
  return anchor.kind === 'port' ? portPoint(object as Wagon, anchor.side, p.sizes.wagonLength) : toward ? cityPoint(object, toward, p.sizes.cityDiameter) : { x: object.x, y: object.y };
}
export function connectionPoints(p: Project, connection: Connection): [Point, Point] {
  const a = anchorPoint(p, connection.a), b = anchorPoint(p, connection.b);
  return [anchorPoint(p, connection.a, b), anchorPoint(p, connection.b, a)];
}
export function routeLabel(p: Project, r: Route): string {
  const cityName = (id: string | null) => {
    const city = p.objects.find(o => o.id === id);
    return city?.type === 'city' ? city.name || `Город ${p.objects.filter(o => o.type === 'city').indexOf(city) + 1}` : '…';
  };
  return `${cityName(r.startCityId)} — ${cityName(r.endCityId)}`;
}

export interface GeneratedRoute { route: Route; wagons: Wagon[] }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function bezier(a: Point, control: Point, b: Point, t: number): Point {
  return { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * control.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * control.y + t * t * b.y };
}
function axes(w: Wagon): Point[] { return [rotate({ x: 1, y: 0 }, w.angle), rotate({ x: 0, y: 1 }, w.angle)]; }
export function wagonsOverlap(a: Wagon, b: Wagon, sizes: Project['sizes']): boolean {
  const [ax, ay] = axes(a), [bx, by] = axes(b);
  const dot = (u: Point, v: Point) => u.x * v.x + u.y * v.y;
  const center = { x: b.x - a.x, y: b.y - a.y };
  return [ax, ay, bx, by].every(n => Math.abs(dot(center, n)) < (sizes.wagonLength * (Math.abs(dot(ax, n)) + Math.abs(dot(bx, n))) + sizes.wagonWidth * (Math.abs(dot(ay, n)) + Math.abs(dot(by, n)))) / 2 - 1e-7);
}
export function wagonCityOverlap(w: Wagon, c: City, sizes: Project['sizes']): boolean {
  const local = rotate({ x: c.x - w.x, y: c.y - w.y }, -w.angle);
  return Math.hypot(Math.max(0, Math.abs(local.x) - sizes.wagonLength / 2), Math.max(0, Math.abs(local.y) - sizes.wagonWidth / 2)) < sizes.cityDiameter / 2 - 1e-7;
}
function cities(p: Project, aId: string, bId: string): [City, City] {
  const a = p.objects.find(o => o.id === aId), b = p.objects.find(o => o.id === bId);
  if (a?.type !== 'city' || b?.type !== 'city' || aId === bId) throw new Error('Выберите два разных города.');
  if (pairCount(p, aId, bId) >= 2) throw new Error('Между этими городами уже есть два маршрута.');
  if (distance(a, b) < 1e-6) throw new Error('Раздвиньте города: их центры совпадают.');
  return [a, b];
}
function validateLayout(p: Project, wagons: Wagon[], endpoints: City[], existing: Wagon[] = []) {
  if (p.objects.length + wagons.length > 20_000) throw new Error('Превышен лимит 20 000 объектов.');
  for (let i = 0; i < wagons.length; i++) {
    if (endpoints.some(c => wagonCityOverlap(wagons[i], c, p.sizes))) throw new Error('Вагоны пересекают город. Измените дугу или расположение.');
    if (wagons.slice(0, i).some(w => wagonsOverlap(wagons[i], w, p.sizes)) || existing.some(w => wagonsOverlap(wagons[i], w, p.sizes))) throw new Error('Вагоны пересекаются. Уменьшите их число или измените дугу / зазор.');
  }
}
export function generateArc(p: Project, aId: string, bId: string, count: number, control: Point, color: Color): GeneratedRoute {
  const [a, b] = cities(p, aId, bId);
  if (!Number.isInteger(count) || count < 1 || count + p.objects.length > 20_000) throw new Error('Количество вагонов должно быть целым положительным числом в пределах лимита объектов.');
  if (!Number.isFinite(control.x) || !Number.isFinite(control.y)) throw new Error('Некорректная управляющая точка.');
  const steps = 2048;
  const samples = Array.from({ length: steps + 1 }, (_, i) => ({ ...bezier(a, control, b, i / steps), t: i / steps, length: 0 }));
  for (let i = 1; i <= steps; i++) samples[i].length = samples[i - 1].length + distance(samples[i], samples[i - 1]);
  const radius = p.sizes.cityDiameter / 2;
  const startIndex = samples.findIndex(s => distance(s, a) >= radius);
  let endIndex = steps - 1;
  while (endIndex >= 0 && distance(samples[endIndex], b) < radius) endIndex--;
  if (startIndex < 1 || endIndex < 0) throw new Error('Между городами недостаточно места.');
  // Refine circle crossings so an exactly fitting 2 mm gap is not lost to sampling.
  const boundaryLength = (index: number, city: City, leaving: boolean) => {
    const lo = samples[index], hi = samples[index + 1];
    let lower = lo.t, upper = hi.t;
    for (let i = 0; i < 32; i++) {
      const middle = (lower + upper) / 2;
      if ((distance(bezier(a, control, b, middle), city) < radius) === leaving) lower = middle;
      else upper = middle;
    }
    return lo.length + (hi.length - lo.length) * ((lower + upper) / 2 - lo.t) / (hi.t - lo.t);
  };
  const startLength = boundaryLength(startIndex - 1, a, true);
  const endLength = boundaryLength(endIndex, b, false);
  const gap = (endLength - startLength - count * p.sizes.wagonLength) / (count + 1);
  if (!Number.isFinite(gap) || gap < 2 - 1e-7) throw new Error('Вагоны не помещаются с зазором 2 мм. Уменьшите их число или измените дугу.');
  const wagons: Wagon[] = [];
  for (let i = 0, sampleIndex = 1; i < count; i++) {
    const length = startLength + gap + p.sizes.wagonLength / 2 + i * (p.sizes.wagonLength + gap);
    while (sampleIndex < steps && samples[sampleIndex].length < length) sampleIndex++;
    const lo = samples[sampleIndex - 1], hi = samples[sampleIndex];
    const fraction = (length - lo.length) / Math.max(hi.length - lo.length, 1e-12);
    const t = lo.t + (hi.t - lo.t) * fraction, point = bezier(a, control, b, t);
    const tangent = { x: 2 * ((1 - t) * (control.x - a.x) + t * (b.x - control.x)), y: 2 * ((1 - t) * (control.y - a.y) + t * (b.y - control.y)) };
    if (Math.hypot(tangent.x, tangent.y) < 1e-8) throw new Error('У дуги резкий разворот. Переместите управляющую точку.');
    wagons.push({ ...point, id: `preview-wagon-${i}`, type: 'wagon', angle: normalizeAngle(Math.atan2(tangent.y, tangent.x) * 180 / Math.PI), color });
  }
  validateLayout(p, wagons, [a, b]);
  return { wagons, route: { id: 'preview-route', startCityId: aId, endCityId: bId, wagons: wagons.map(w => ({ wagonId: w.id, entry: 'minus' })), showConnections: true } };
}
export function generateParallel(p: Project, sourceId: string, gap: number, side: number, color: Color): GeneratedRoute {
  const source = p.routes.find(r => r.id === sourceId);
  if (!source || !source.startCityId || !source.endCityId) throw new Error('Выберите завершённый маршрут.');
  const endpoints = cities(p, source.startCityId, source.endCityId);
  if (!Number.isFinite(gap) || gap < 0 || ![-1, 1].includes(side)) throw new Error('Зазор должен быть неотрицательным.');
  const originals = source.wagons.map(item => p.objects.find(o => o.id === item.wagonId) as Wagon);
  const wagons = originals.map((w, i) => {
    const forward = w.angle + (source.wagons[i].entry === 'plus' ? 180 : 0);
    const offset = rotate({ x: 0, y: side * (p.sizes.wagonWidth + gap) }, forward);
    return { ...w, id: `preview-wagon-${i}`, x: w.x + offset.x, y: w.y + offset.y, color };
  });
  validateLayout(p, wagons, endpoints, originals);
  return { wagons, route: { ...source, id: 'preview-route', wagons: source.wagons.map((item, i) => ({ ...item, wagonId: wagons[i].id })), showConnections: true } };
}
export function insertGenerated(p: Project, generated: GeneratedRoute): Project {
  const ids = new Map(generated.wagons.map(w => [w.id, crypto.randomUUID()]));
  const wagons = generated.wagons.map(w => ({ ...w, id: ids.get(w.id)! }));
  const route = { ...generated.route, id: crypto.randomUUID(), wagons: generated.route.wagons.map(w => ({ ...w, wagonId: ids.get(w.wagonId)! })) };
  const next = { ...p, objects: [...p.objects, ...wagons], routes: [...p.routes, route] };
  parseProject(next); return next;
}
