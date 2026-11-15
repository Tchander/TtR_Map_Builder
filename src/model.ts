import { z } from 'zod';

export const PALETTE = [
  { id: 'gray', name: 'Серый', hex: '#9ca3af' },
  { id: 'white', name: 'Белый', hex: '#fafafa' },
  { id: 'black', name: 'Чёрный', hex: '#38393f' },
  { id: 'pink', name: 'Розовый', hex: '#e58db5' },
  { id: 'green', name: 'Зелёный', hex: '#71b073' },
  { id: 'blue', name: 'Синий', hex: '#4186c6' },
  { id: 'red', name: 'Красный', hex: '#d84f4f' },
  { id: 'yellow', name: 'Жёлтый', hex: '#f3d362' },
  { id: 'orange', name: 'Оранжевый', hex: '#e89248' },
] as const;
export type Color = typeof PALETTE[number]['id'];
const colorSchema = z.enum(['gray', 'white', 'black', 'pink', 'green', 'blue', 'red', 'yellow', 'orange']);
const number = z.number().finite();
const positive = number.positive();
export const DEFAULT_CITY_LABEL_SIZE = 3.5;
const base = { id: z.string().min(1).max(128), x: number, y: number };
export const cityStyleSchema = z.enum([
  'classic', 'apricot', 'amber', 'mandarin', 'azure', 'denim', 'sapphire',
  'pistachio', 'mint', 'eucalyptus', 'emerald',
]);
export type CityStyle = z.infer<typeof cityStyleSchema>;
export const CITY_STYLE_NAMES: Record<CityStyle, string> = {
  classic: 'Белый', apricot: 'Абрикос', amber: 'Янтарь', mandarin: 'Мандарин',
  azure: 'Лазурь', denim: 'Деним', sapphire: 'Сапфир',
  pistachio: 'Фисташка', mint: 'Мята', eucalyptus: 'Эвкалипт', emerald: 'Изумруд',
};
const citySchema = z.object({
  ...base, type: z.literal('city'), name: z.string().max(120),
  labelOffset: z.object({ x: number, y: number }), markerStyle: cityStyleSchema.optional(),
});
const wagonKindSchema = z.enum(['regular', 'locomotive', 'tunnel']);
export type WagonKind = z.infer<typeof wagonKindSchema>;
const wagonSchema = z.object({
  ...base, type: z.literal('wagon'), kind: wagonKindSchema.optional(), angle: number, color: colorSchema,
  locomotiveFlipped: z.boolean().optional(),
});
export const backgroundSchema = z.object({
  dataUrl: z.string().max(140_000_000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/),
  name: z.string().max(255), pixelWidth: positive, pixelHeight: positive,
  x: number, y: number, width: positive, height: positive,
  opacity: number.min(0).max(1), visible: z.boolean(),
});
const projectFields = {
  format: z.literal('ttr-map'),
  board: z.object({ width: positive, height: positive }),
  sizes: z.object({ wagonLength: positive, wagonWidth: positive, cityDiameter: positive, cityLabelFontSize: positive.default(DEFAULT_CITY_LABEL_SIZE) }),
  objects: z.array(z.discriminatedUnion('type', [citySchema, wagonSchema])).max(20_000),
  background: backgroundSchema.nullable(),
};
const projectV1Schema = z.object({ ...projectFields, version: z.literal(1) });
export const routeSchema = z.object({
  id: z.string().min(1).max(128),
  startCityId: z.string().min(1).nullable(), endCityId: z.string().min(1).nullable(),
  wagons: z.array(z.object({ wagonId: z.string().min(1), entry: z.enum(['minus', 'plus']) })).min(1).max(20_000),
  showConnections: z.boolean(),
});
export type Route = z.infer<typeof routeSchema>;
export type Port = 'minus' | 'plus';
export const projectSchema = z.object({ ...projectFields, version: z.literal(2), routes: z.array(routeSchema).max(20_000) }).superRefine((project, ctx) => {
  const ids = new Set<string>();
  for (const object of project.objects) {
    if (ids.has(object.id)) ctx.addIssue({ code: 'custom', message: 'Повторяющийся ID объекта', path: ['objects'] });
    ids.add(object.id);
  }
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['routes'] });
  const objects = new Map(project.objects.map(o => [o.id, o]));
  const used = new Set<string>(), routeIds = new Set<string>(), pairs = new Map<string, number>();
  for (const route of project.routes) {
    if (routeIds.has(route.id)) fail('Повторяющийся ID маршрута.');
    routeIds.add(route.id);
    for (const id of [route.startCityId, route.endCityId]) if (id && objects.get(id)?.type !== 'city') fail('Маршрут ссылается на отсутствующий город.');
    if (route.startCityId && route.startCityId === route.endCityId) fail('Маршрут должен соединять разные города.');
    if (route.wagons.length === 1 && !route.startCityId && !route.endCityId) fail('Вагон без соединений должен быть свободным объектом.');
    for (const item of route.wagons) {
      if (objects.get(item.wagonId)?.type !== 'wagon') fail('Маршрут ссылается на отсутствующий вагон.');
      if (used.has(item.wagonId)) fail('Вагон может входить только в одну цепочку и только один раз.');
      used.add(item.wagonId);
    }
    if (route.startCityId && route.endCityId) {
      const key = JSON.stringify([route.startCityId, route.endCityId].sort());
      const count = (pairs.get(key) ?? 0) + 1; pairs.set(key, count);
      if (count > 2) fail('Между двумя городами допускается максимум два маршрута.');
    }
  }
});
export type City = z.infer<typeof citySchema>;
export type Wagon = z.infer<typeof wagonSchema>;
export type MapObject = City | Wagon;
export type Background = z.infer<typeof backgroundSchema>;
export type ProjectV1 = z.infer<typeof projectV1Schema>;
export type ProjectV2 = z.infer<typeof projectSchema>;
export type Project = ProjectV2;

export function createProject(): Project {
  return { format: 'ttr-map', version: 2, board: { width: 785, height: 525 }, sizes: { wagonLength: 26, wagonWidth: 9, cityDiameter: 10, cityLabelFontSize: DEFAULT_CITY_LABEL_SIZE }, objects: [], background: null, routes: [] };
}
export function parseProject(input: unknown): Project {
  if (typeof input === 'object' && input !== null && 'version' in input) {
    if (input.version === 1) {
      const old = projectV1Schema.safeParse(input);
      if (!old.success) throw new Error('Некорректный проект версии 1.');
      input = { ...old.data, version: 2, routes: [] };
    } else if (input.version !== 2) throw new Error('Эта версия проекта не поддерживается. Поддерживаются версии 1 и 2.');
  }
  const result = projectSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Некорректный проект: ${issue.path.join('.') || 'структура файла'}. ${issue.code === 'custom' ? issue.message : 'Проверьте размеры, объекты и подложку.'}`);
  }
  return { ...result.data, objects: result.data.objects.map(object => object.type === 'wagon'
    ? { ...object, angle: normalizeAngle(object.angle), color: wagonColor(object.kind, object.color) }
    : object) };
}
export function wagonColor(kind: WagonKind | undefined, color: Color): Color {
  return kind === 'locomotive' ? 'gray' : color;
}
export function parseProjectText(text: string): Project {
  let input: unknown;
  try { input = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Не удалось прочитать JSON. Файл повреждён или имеет другой формат.'); }
  return parseProject(input);
}
export const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
export const colorHex = (color: Color) => PALETTE.find(item => item.id === color)!.hex;
export const serializeProject = (project: Project) => JSON.stringify(project, null, 2);

export interface Camera { x: number; y: number; scale: number }
export interface Point { x: number; y: number }
export const screenToWorld = (point: Point, camera: Camera): Point => ({ x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale });
export const worldToScreen = (point: Point, camera: Camera): Point => ({ x: point.x * camera.scale + camera.x, y: point.y * camera.scale + camera.y });
export function zoomAt(camera: Camera, cursor: Point, scale: number): Camera {
  const world = screenToWorld(cursor, camera);
  return { x: cursor.x - world.x * scale, y: cursor.y - world.y * scale, scale };
}
export function rotate(point: Point, angle: number): Point {
  const radians = angle * Math.PI / 180;
  return { x: point.x * Math.cos(radians) - point.y * Math.sin(radians), y: point.x * Math.sin(radians) + point.y * Math.cos(radians) };
}
export function fitCamera(width: number, height: number, board: ProjectV1['board']): Camera {
  const scale = Math.min((width - 96) / board.width, (height - 100) / board.height);
  const safe = Math.max(0.0001, scale);
  return { x: (width - board.width * safe) / 2, y: (height - board.height * safe) / 2, scale: safe };
}
export function makeObject(type: 'city' | 'wagon', point: Point, color: Color = 'gray', kind: WagonKind = 'regular', cityStyle: CityStyle = 'classic'): MapObject {
  const base = { id: crypto.randomUUID(), ...point };
  return type === 'city' ? { ...base, type, name: '', markerStyle: cityStyle, labelOffset: { x: 8, y: -7 } } : { ...base, type, kind, angle: 0, color: wagonColor(kind, color) };
}
export function fitBackground(asset: { dataUrl: string; name: string; pixelWidth: number; pixelHeight: number }, board: ProjectV1['board']): Background {
  const scale = Math.min(board.width / asset.pixelWidth, board.height / asset.pixelHeight);
  const width = asset.pixelWidth * scale, height = asset.pixelHeight * scale;
  return { ...asset, x: (board.width - width) / 2, y: (board.height - height) / 2, width, height, opacity: 1, visible: true };
}
