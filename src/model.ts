import { z } from 'zod';

export const PALETTE = [
  { id: 'gray', name: 'Серый', hex: '#9ca3af' },
  { id: 'white', name: 'Белый', hex: '#ffffff' },
  { id: 'black', name: 'Чёрный', hex: '#292a30' },
  { id: 'pink', name: 'Розовый', hex: '#e58db5' },
  { id: 'green', name: 'Зелёный', hex: '#63a765' },
  { id: 'blue', name: 'Синий', hex: '#4186c6' },
  { id: 'red', name: 'Красный', hex: '#d84f4f' },
  { id: 'yellow', name: 'Жёлтый', hex: '#f0cb4f' },
  { id: 'orange', name: 'Оранжевый', hex: '#e89248' },
] as const;
export type Color = typeof PALETTE[number]['id'];
const colorSchema = z.enum(['gray', 'white', 'black', 'pink', 'green', 'blue', 'red', 'yellow', 'orange']);
const number = z.number().finite();
const positive = number.positive();
const base = { id: z.string().min(1).max(128), x: number, y: number };
const citySchema = z.object({ ...base, type: z.literal('city'), name: z.string().max(120), labelOffset: z.object({ x: number, y: number }) });
const wagonSchema = z.object({ ...base, type: z.literal('wagon'), angle: number, color: colorSchema });
export const backgroundSchema = z.object({
  dataUrl: z.string().max(140_000_000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/),
  name: z.string().max(255), pixelWidth: positive, pixelHeight: positive,
  x: number, y: number, width: positive, height: positive,
  opacity: number.min(0).max(1), visible: z.boolean(),
});
export const projectSchema = z.object({
  format: z.literal('ttr-map'), version: z.literal(1),
  board: z.object({ width: positive, height: positive }),
  sizes: z.object({ wagonLength: positive, wagonWidth: positive, cityDiameter: positive }),
  objects: z.array(z.discriminatedUnion('type', [citySchema, wagonSchema])).max(20_000),
  background: backgroundSchema.nullable(),
}).superRefine((project, ctx) => {
  const ids = new Set<string>();
  for (const object of project.objects) {
    if (ids.has(object.id)) ctx.addIssue({ code: 'custom', message: 'Повторяющийся ID объекта', path: ['objects'] });
    ids.add(object.id);
  }
});
export type City = z.infer<typeof citySchema>;
export type Wagon = z.infer<typeof wagonSchema>;
export type MapObject = City | Wagon;
export type Background = z.infer<typeof backgroundSchema>;
export type ProjectV1 = z.infer<typeof projectSchema>;

export function createProject(): ProjectV1 {
  return { format: 'ttr-map', version: 1, board: { width: 785, height: 525 }, sizes: { wagonLength: 26, wagonWidth: 9, cityDiameter: 10 }, objects: [], background: null };
}
export function parseProject(input: unknown): ProjectV1 {
  if (typeof input === 'object' && input !== null && 'version' in input && input.version !== 1) {
    throw new Error('Эта версия проекта не поддерживается. Нужен формат версии 1.');
  }
  const result = projectSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Некорректный проект: ${issue.path.join('.') || 'структура файла'}. Проверьте размеры, объекты и подложку.`);
  }
  return { ...result.data, objects: result.data.objects.map(object => object.type === 'wagon' ? { ...object, angle: normalizeAngle(object.angle) } : object) };
}
export function parseProjectText(text: string): ProjectV1 {
  let input: unknown;
  try { input = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Не удалось прочитать JSON. Файл повреждён или имеет другой формат.'); }
  return parseProject(input);
}
export const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
export const colorHex = (color: Color) => PALETTE.find(item => item.id === color)!.hex;
export const serializeProject = (project: ProjectV1) => JSON.stringify(project, null, 2);

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
export function makeObject(type: 'city' | 'wagon', point: Point, color: Color = 'gray'): MapObject {
  const base = { id: crypto.randomUUID(), ...point };
  return type === 'city' ? { ...base, type, name: '', labelOffset: { x: 8, y: -7 } } : { ...base, type, angle: 0, color };
}
export function fitBackground(asset: { dataUrl: string; name: string; pixelWidth: number; pixelHeight: number }, board: ProjectV1['board']): Background {
  const scale = Math.min(board.width / asset.pixelWidth, board.height / asset.pixelHeight);
  const width = asset.pixelWidth * scale, height = asset.pixelHeight * scale;
  return { ...asset, x: (board.width - width) / 2, y: (board.height - height) / 2, width, height, opacity: 1, visible: true };
}
