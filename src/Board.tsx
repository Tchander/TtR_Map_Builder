import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { fitCamera, makeObject, normalizeAngle, screenToWorld, zoomAt, type Camera, type Color, type Point, type Project } from './model';
import { backgroundMarkup, sceneMarkup } from './scene';
import type { Editor } from './useEditor';
import { formatNumber } from './Fields';
import { allConnections, anchorPoint, connectionError, connectionPoints, freePort, portPoint, sameAnchor, type Anchor, type GeneratedRoute } from './routes';
import type { LinkSelection, RouteMode } from './RoutePanel';

export type Tool = 'select' | 'city' | 'wagon' | 'route';
interface Drag {
  kind: 'pan' | 'object' | 'rotate' | 'label' | 'background' | 'connect' | 'control';
  start: Point; camera: Camera; before: Project; id?: string; startAngle?: number;
  control?: Point;
}
export default function Board({ editor, tool, color, selectedId, onSelect, backgroundMode, fitToken, onCursor, routeMode, selectedLink, onSelectLink, onConnect, onError, onPickCity, control, onControl, curve, preview }: {
  editor: Editor; tool: Tool; color: Color; selectedId: string | null; onSelect: (id: string | null) => void;
  backgroundMode: boolean; fitToken: number; onCursor: (point: Point | null) => void;
  routeMode: RouteMode; selectedLink: LinkSelection | null; onSelectLink: (link: LinkSelection) => void;
  onConnect: (a: Anchor, b: Anchor) => void; onError: (message: string) => void; onPickCity: (id: string) => void;
  control: Point | null; onControl: (point: Point) => void; curve: { a: Point; b: Point } | null; preview: GeneratedRoute | null;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 40, y: 40, scale: 1 });
  const cameraRef = useRef(camera); cameraRef.current = camera;
  const [space, setSpace] = useState(false);
  const spaceRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [gesture, setGesture] = useState<{ source: Anchor; mouse: Point; target: Anchor | null; error: string | null } | null>(null);
  const gestureRef = useRef(gesture);
  const updateGesture = (value: typeof gesture) => { gestureRef.current = value; setGesture(value); };
  const project = editor.project;
  const projectRef = useRef(project); projectRef.current = project;
  const selected = project.objects.find(object => object.id === selectedId);
  const objectsSvg = useMemo(() => sceneMarkup(project, true), [project.objects, project.sizes]);
  const bgSvg = useMemo(() => backgroundMarkup(project), [project.background]);
  const connections = useMemo(() => allConnections(project), [project.routes]);
  const previewProject = preview ? { ...project, objects: [...project.objects, ...preview.wagons], routes: [preview.route] } : null;
  useEffect(() => { updateGesture(null); }, [tool, routeMode]);
  useEffect(() => {
    function cancel(event: KeyboardEvent) {
      if (event.code !== 'Escape' || !drag.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const active = drag.current;
      if (active.kind === 'control' && active.control) onControl(active.control);
      else if (!['connect', 'pan'].includes(active.kind)) editor.preview(active.before);
      drag.current = null; updateGesture(null); setDragging(false);
    }
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [editor.preview, onControl]);
  const fit = () => { const node = wrapper.current; if (node) setCamera(fitCamera(node.clientWidth, node.clientHeight, projectRef.current.board)); };
  useLayoutEffect(() => {
    let first = true;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
      if (first) { setCamera(fitCamera(width, height, projectRef.current.board)); first = false; }
    });
    observer.observe(wrapper.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(fit, [fitToken]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.code !== 'Space' || (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
      event.preventDefault(); spaceRef.current = event.type === 'keydown'; setSpace(spaceRef.current);
    }
    function blur() { spaceRef.current = false; setSpace(false); }
    window.addEventListener('keydown', key); window.addEventListener('keyup', key); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); window.removeEventListener('blur', blur); };
  }, []);
  useEffect(() => {
    const element = wrapper.current!;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      if (drag.current) return;
      const bounds = element.getBoundingClientRect();
      const cursor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      setCamera(current => zoomAt(current, cursor, Math.min(100, Math.max(0.0001, current.scale * Math.exp(-event.deltaY * 0.0015)))));
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  function local(event: React.PointerEvent): Point {
    const bounds = wrapper.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  function findAnchor(world: Point): Anchor | null {
    let best: Anchor | null = null, nearest = 11 / camera.scale;
    for (const object of project.objects) if (object.type === 'wagon') {
      for (const side of ['minus', 'plus'] as const) {
        const point = portPoint(object, side, project.sizes.wagonLength), d = Math.hypot(world.x - point.x, world.y - point.y);
        if (d < nearest) { nearest = d; best = { kind: 'port', wagonId: object.id, side }; }
      }
    }
    if (best) return best;
    const city = [...project.objects].reverse().find(o => o.type === 'city' && Math.hypot(world.x - o.x, world.y - o.y) <= project.sizes.cityDiameter / 2 + 6 / camera.scale);
    return city ? { kind: 'city', cityId: city.id } : null;
  }
  function down(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    const start = local(event), before = editor.current();
    const world = screenToWorld(start, camera);
    const target = event.target as Element;
    if (spaceRef.current || event.button === 1) {
      drag.current = { kind: 'pan', start, camera, before };
    } else if (backgroundMode && before.background) {
      const bg = before.background;
      if (!bg.visible || world.x < bg.x || world.y < bg.y || world.x > bg.x + bg.width || world.y > bg.y + bg.height) return;
      drag.current = { kind: 'background', start, camera, before };
    } else if (tool === 'route') {
      if (target.closest('[data-control]') && control) {
        drag.current = { kind: 'control', start, camera, before, control };
      } else if (routeMode === 'arc') {
        const id = target.closest('[data-object-id]')?.getAttribute('data-object-id');
        if (id && before.objects.some(o => o.id === id && o.type === 'city')) onPickCity(id);
        return;
      } else {
        const anchor = findAnchor(world);
        if (!anchor) {
          const line = target.closest('[data-connection]');
          if (line) onSelectLink({ routeId: line.getAttribute('data-route-id')!, slot: Number(line.getAttribute('data-slot')) });
          return;
        }
        if (!freePort(before, anchor)) { onError('Этот торец уже занят соединением.'); return; }
        updateGesture({ source: anchor, mouse: world, target: null, error: null });
        drag.current = { kind: 'connect', start, camera, before };
      }
    } else if (tool === 'city' || tool === 'wagon') {
      if (world.x < 0 || world.y < 0 || world.x > project.board.width || world.y > project.board.height) return;
      const object = makeObject(tool, world, color);
      editor.edit(current => ({ ...current, objects: [...current.objects, object] }));
      onSelect(object.id); return;
    } else if (target.closest('[data-rotate]') && selected?.type === 'wagon') {
      drag.current = { kind: 'rotate', id: selected.id, start, camera, before, startAngle: Math.atan2(world.y - selected.y, world.x - selected.x) * 180 / Math.PI };
    } else {
      const line = target.closest('[data-connection]');
      if (line) { onSelectLink({ routeId: line.getAttribute('data-route-id')!, slot: Number(line.getAttribute('data-slot')) }); return; }
      const element = target.closest('[data-object-id]');
      const id = element?.getAttribute('data-object-id');
      onSelect(id ?? null);
      if (!id) return;
      drag.current = { kind: target.closest('[data-part="label"]') ? 'label' : 'object', id, start, camera, before };
    }
    svg.current!.setPointerCapture(event.pointerId); setDragging(true);
  }
  function move(event: React.PointerEvent) {
    const position = local(event);
    onCursor(screenToWorld(position, camera));
    const active = drag.current;
    if (!active) return;
    if (active.kind === 'control') { onControl(screenToWorld(position, active.camera)); return; }
    if (active.kind === 'connect' && gestureRef.current) {
      const mouse = screenToWorld(position, active.camera), source = gestureRef.current.source;
      const target = findAnchor(mouse);
      updateGesture({ source, mouse, target, error: target ? connectionError(editor.current(), source, target) : null }); return;
    }
    const dx = (position.x - active.start.x) / active.camera.scale;
    const dy = (position.y - active.start.y) / active.camera.scale;
    if (active.kind === 'pan') {
      setCamera({ ...active.camera, x: active.camera.x + position.x - active.start.x, y: active.camera.y + position.y - active.start.y }); return;
    }
    if (active.kind === 'background') {
      const bg = active.before.background!;
      editor.preview({ ...active.before, background: { ...bg, x: bg.x + dx, y: bg.y + dy } }); return;
    }
    const objects = active.before.objects.map(object => {
      if (object.id !== active.id) return object;
      if (active.kind === 'rotate' && object.type === 'wagon') {
        const world = screenToWorld(position, active.camera);
        let angle = object.angle + Math.atan2(world.y - object.y, world.x - object.x) * 180 / Math.PI - active.startAngle!;
        if (event.shiftKey) angle = Math.round(angle / 15) * 15;
        return { ...object, angle: normalizeAngle(angle) };
      }
      if (active.kind === 'label' && object.type === 'city') return { ...object, labelOffset: { x: object.labelOffset.x + dx, y: object.labelOffset.y + dy } };
      return { ...object, x: object.x + dx, y: object.y + dy };
    });
    editor.preview({ ...active.before, objects });
  }
  function up(event: React.PointerEvent) {
    const active = drag.current;
    if (!active) return;
    if (active.kind === 'connect') {
      const g = gestureRef.current;
      if (event.type === 'pointerup' && g?.target) {
        if (g.error) onError(g.error); else onConnect(g.source, g.target);
      }
      updateGesture(null);
    } else if (active.kind === 'control') {
      if (event.type === 'pointercancel' && active.control) onControl(active.control);
    } else if (active.kind !== 'pan') {
      if (event.type === 'pointercancel') editor.preview(active.before);
      else editor.finish(active.before);
    }
    drag.current = null; setDragging(false);
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
  }
  const selectionWidth = selected?.type === 'wagon' ? project.sizes.wagonLength : project.sizes.cityDiameter;
  const selectionHeight = selected?.type === 'wagon' ? project.sizes.wagonWidth : project.sizes.cityDiameter;
  const padding = 4 / camera.scale;
  const rotateY = -selectionHeight / 2 - 26 / camera.scale;
  function stepZoom(factor: number) {
    setCamera(current => zoomAt(current, { x: size.width / 2, y: size.height / 2 }, Math.min(100, Math.max(0.0001, current.scale * factor))));
  }
  return <div ref={wrapper} className={`board-workspace ${space || (dragging && drag.current?.kind === 'pan') ? 'pan-tool' : tool !== 'select' ? 'place-tool' : ''} ${dragging ? 'dragging' : ''}`}>
    <div className="canvas-caption"><span className="live-dot" />{backgroundMode ? 'РЕЖИМ ПОДЛОЖКИ' : 'РАБОЧЕЕ ПОЛЕ'}<span>{formatNumber(project.board.width)} × {formatNumber(project.board.height)} мм</span></div>
    <svg ref={svg} className="board-svg" data-testid="board" aria-label="Редактор игрового поля" width="100%" height="100%"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onPointerLeave={() => { if (!drag.current) onCursor(null); }} onContextMenu={event => event.preventDefault()}>
      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
        <rect className="paper" width={project.board.width} height={project.board.height} fill="white" />
        <svg width={project.board.width} height={project.board.height} overflow="hidden" pointerEvents="none"><g dangerouslySetInnerHTML={{ __html: bgSvg }} /></svg>
        <g className="route-connections">{connections.map(c => {
          if (!project.routes.find(r => r.id === c.routeId)?.showConnections) return null;
          const [a, b] = connectionPoints(project, c), chosen = selectedLink?.routeId === c.routeId && selectedLink.slot === c.slot;
          return <g key={`${c.routeId}-${c.slot}`}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={chosen ? '#b45d42' : '#34383e'} strokeWidth={chosen ? Math.max(.3, 2 / camera.scale) : .3} pointerEvents="none" /><line data-connection="true" data-route-id={c.routeId} data-slot={c.slot} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={10 / camera.scale} style={{ cursor: 'pointer' }} /></g>;
        })}</g>
        <g className="map-objects" dangerouslySetInnerHTML={{ __html: objectsSvg }} opacity={backgroundMode ? 0.5 : 1} />
        {previewProject && <g className="route-preview" pointerEvents="none" opacity={.65} dangerouslySetInnerHTML={{ __html: sceneMarkup({ ...previewProject, objects: previewProject.objects.filter(o => o.type === 'city' || preview!.wagons.some(w => w.id === o.id)) }) }} />}
        {tool === 'route' && routeMode === 'connect' && <g className="route-ports">{project.objects.flatMap(o => o.type === 'wagon' ? (['minus', 'plus'] as const).map(side => {
          const a: Anchor = { kind: 'port', wagonId: o.id, side }, point = portPoint(o, side, project.sizes.wagonLength);
          const available = freePort(project, a), hovered = gesture?.target && sameAnchor(gesture.target, a);
          return <circle key={`${o.id}-${side}`} data-port={side} data-wagon-id={o.id} cx={point.x} cy={point.y} r={4.5 / camera.scale} fill={hovered ? gesture.error ? '#c94d46' : '#4b996b' : available ? 'white' : '#d6d9dc'} stroke={available ? '#b45d42' : '#929ba2'} strokeWidth={1.5 / camera.scale} />;
        }) : [])}</g>}
        {gesture && (() => {
          const target = gesture.target ? anchorPoint(project, gesture.target) : gesture.mouse;
          const a = anchorPoint(project, gesture.source, target), b = gesture.target ? anchorPoint(project, gesture.target, a) : gesture.mouse;
          const targetCityId = gesture.target?.kind === 'city' ? gesture.target.cityId : null;
          const city = targetCityId ? project.objects.find(o => o.id === targetCityId) : null;
          return <g pointerEvents="none"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={gesture.error ? '#c94d46' : '#b45d42'} strokeWidth={1.5 / camera.scale} strokeDasharray={`${5 / camera.scale} ${3 / camera.scale}`} />{city && <circle cx={city.x} cy={city.y} r={project.sizes.cityDiameter / 2 + 3 / camera.scale} fill="none" stroke={gesture.error ? '#c94d46' : '#4b996b'} strokeWidth={2 / camera.scale} />}</g>;
        })()}
        {tool === 'route' && curve && control && <g className="curve-guide"><path d={`M ${curve.a.x} ${curve.a.y} Q ${control.x} ${control.y} ${curve.b.x} ${curve.b.y}`} fill="none" stroke="#b45d42" strokeWidth={1 / camera.scale} strokeDasharray={`${5 / camera.scale} ${4 / camera.scale}`} pointerEvents="none" /><path d={`M ${curve.a.x} ${curve.a.y} L ${control.x} ${control.y} L ${curve.b.x} ${curve.b.y}`} fill="none" stroke="#b45d4260" strokeWidth={1 / camera.scale} pointerEvents="none" /><circle data-control="true" data-testid="curve-control" cx={control.x} cy={control.y} r={8 / camera.scale} fill="#b45d42" stroke="white" strokeWidth={2 / camera.scale} style={{ cursor: 'grab' }} /></g>}
        {backgroundMode && project.background?.visible && <rect x={project.background.x} y={project.background.y} width={project.background.width} height={project.background.height} fill="transparent" stroke="#b75b3f" strokeWidth={1.5 / camera.scale} strokeDasharray={`${6 / camera.scale} ${4 / camera.scale}`} />}
        {!backgroundMode && selected && tool === 'select' && <g className="selection" transform={`translate(${selected.x} ${selected.y}) rotate(${selected.type === 'wagon' ? selected.angle : 0})`}>
          <rect x={-selectionWidth / 2 - padding} y={-selectionHeight / 2 - padding} width={selectionWidth + 2 * padding} height={selectionHeight + 2 * padding} rx={2 / camera.scale} fill="none" stroke="#b75b3f" strokeWidth={1.4 / camera.scale} pointerEvents="none" />
          {selected.type === 'wagon' && <><line x1={0} x2={0} y1={-selectionHeight / 2 - padding} y2={rotateY} stroke="#b75b3f" strokeWidth={1 / camera.scale} pointerEvents="none" /><circle data-rotate="true" data-testid="rotation-handle" cx={0} cy={rotateY} r={7 / camera.scale} fill="white" stroke="#b75b3f" strokeWidth={2 / camera.scale} style={{ cursor: 'grab' }} /></>}
        </g>}
      </g>
    </svg>
    {project.objects.length === 0 && !project.background && <div className="empty-hint"><span>Каждое путешествие начинается с города</span><small>Выберите «Город» слева и нажмите на поле</small></div>}
    <div className="canvas-bottom"><span className="canvas-help">{backgroundMode ? 'Перетащите подложку · Настройки справа' : tool === 'route' ? routeMode === 'connect' ? 'Соединяйте свободные торцы и города · Esc — отмена' : 'Выберите города · Перетяните точку изгиба' : tool === 'city' ? 'Нажмите, чтобы добавить город · Esc — выделение' : tool === 'wagon' ? 'Нажмите, чтобы добавить вагон · Esc — выделение' : 'Колёсико — масштаб · Пробел + мышь — перемещение'}</span>
      <div className="zoom-controls"><button title="Уменьшить" aria-label="Уменьшить" onClick={() => stepZoom(1 / 1.2)}><Minus size={15} /></button><span>{formatNumber(camera.scale / (96 / 25.4) * 100, 0)}%</span><button title="Увеличить" aria-label="Увеличить" onClick={() => stepZoom(1.2)}><Plus size={15} /></button><i /><button title="Показать поле целиком" aria-label="Показать поле целиком" onClick={fit}><Maximize size={16} /></button></div>
    </div>
  </div>;
}
