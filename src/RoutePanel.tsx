import { GitBranch, Link2, Spline, Unlink, CopyPlus } from 'lucide-react';
import type { Color, Point, Route } from './model';
import { complete, pairCount, routeLabel, type GeneratedRoute } from './routes';
import type { Editor } from './useEditor';
import { NumberField, Palette } from './Fields';

export type RouteMode = 'connect' | 'arc';
export type Draft = { kind: 'arc'; startCityId: string; endCityId: string; count: number; color: Color; control: Point | null }
  | { kind: 'parallel'; sourceId: string; gap: number; side: number; color: Color };
export type LinkSelection = { routeId: string; slot: number };
export const newDraft = (color: Color): Draft => ({ kind: 'arc', startCityId: '', endCityId: '', count: 3, color, control: null });

export default function RoutePanel({ editor, active, mode, onMode, draft, setDraft, preview, error, route, link, onCreate, onCancel, onParallel, onDisconnect, onDismantle }: {
  editor: Editor; active: boolean; mode: RouteMode; onMode: (mode: RouteMode) => void;
  draft: Draft | null; setDraft: (draft: Draft) => void; preview: GeneratedRoute | null; error: string;
  route: Route | undefined; link: LinkSelection | null; onCreate: () => void; onCancel: () => void;
  onParallel: (route: Route) => void; onDisconnect: () => void; onDismantle: (id: string) => void;
}) {
  const p = editor.project;
  const cities = p.objects.filter(o => o.type === 'city');
  const name = (id: string) => { const city = cities.find(o => o.id === id); return city?.name || `Город ${cities.indexOf(city!) + 1}`; };
  const updateRoute = (update: Partial<Route>) => editor.edit(p => ({ ...p, routes: p.routes.map(r => r.id === route?.id ? { ...r, ...update } : r) }));
  return <>
    {active && <section className="route-tools"><h3><GitBranch size={16} />Маршруты</h3>
      <div className="route-tabs"><button className={mode === 'connect' && draft?.kind !== 'parallel' ? 'active' : ''} onClick={() => onMode('connect')}><Link2 size={14} />Соединить</button><button className={mode === 'arc' && draft?.kind !== 'parallel' ? 'active' : ''} onClick={() => onMode('arc')}><Spline size={14} />По дуге</button></div>
      {mode === 'connect' && draft?.kind !== 'parallel' && <p className="field-hint">Тяните линию от точки на торце вагона к другому свободному торцу или городу. Начинать можно с любого конца.</p>}
      {draft?.kind === 'arc' && <>
        <p className="field-hint">Выберите два города на поле или в списках. Перетащите оранжевую точку, чтобы задать изгиб.</p>
        {(['startCityId', 'endCityId'] as const).map((key, i) => <label className="route-select" key={key}>{i ? 'Конечный город' : 'Начальный город'}<select aria-label={i ? 'Конечный город' : 'Начальный город'} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value, control: null })}><option value="">Выберите город</option>{cities.map(c => <option key={c.id} value={c.id}>{name(c.id)}</option>)}</select></label>)}
        <NumberField label="Вагонов в маршруте" value={draft.count} min={1} unit="шт." onChange={count => setDraft({ ...draft, count })} />
      </>}
      {draft?.kind === 'parallel' && <><h3>Параллельный маршрут</h3><div className="route-tabs"><button className={draft.side === 1 ? 'active' : ''} onClick={() => setDraft({ ...draft, side: 1 })}>Сторона 1</button><button className={draft.side === -1 ? 'active' : ''} onClick={() => setDraft({ ...draft, side: -1 })}>Сторона 2</button></div><NumberField label="Зазор между рядами" value={draft.gap} min={0} onChange={gap => setDraft({ ...draft, gap })} /></>}
      {draft && <><label className="small-label">Цвет нового маршрута</label><Palette value={draft.color} onChange={color => setDraft({ ...draft, color })} />
        {error && <p className="route-error" role="status">{error}</p>}
        <button className="primary-button wide" disabled={!preview} onClick={onCreate}>Создать маршрут</button><button className="text-button wide" onClick={onCancel}>Отменить создание</button></>}
    </section>}
    {route && <section className="route-details" data-testid="route-details"><h3><GitBranch size={16} />{complete(route) ? 'Маршрут' : 'Незавершённый маршрут'}</h3>
      <strong className="route-name">{routeLabel(p, route)}</strong><p className="field-hint">Вагонов: {route.wagons.length}{complete(route) ? ` · Маршрутов между городами: ${pairCount(p, route.startCityId!, route.endCityId!)}/2` : ' · Можно достроить позже'}</p>
      <label className="checkbox"><input aria-label="Показывать соединения" type="checkbox" checked={route.showConnections} onChange={event => updateRoute({ showConnections: event.target.checked })} />Показывать соединения</label>
      <label className="small-label">Цвет всех вагонов маршрута</label><Palette value={(p.objects.find(o => o.id === route.wagons[0].wagonId) as { color: Color }).color} onChange={color => editor.edit(p => ({ ...p, objects: p.objects.map(o => o.type === 'wagon' && route.wagons.some(w => w.wagonId === o.id) ? { ...o, color } : o) }))} />
      {complete(route) && <button className="outline-button wide" disabled={pairCount(p, route.startCityId!, route.endCityId!) >= 2} onClick={() => onParallel(route)}><CopyPlus size={14} />Создать параллельный</button>}
      {link && <button className="outline-button wide" onClick={onDisconnect}><Unlink size={14} />Удалить выбранную связь</button>}
      <button className="text-button wide" onClick={() => onDismantle(route.id)}><Unlink size={14} />Разобрать маршрут</button>
    </section>}
  </>;
}
