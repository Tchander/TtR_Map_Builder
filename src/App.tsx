import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Download, FilePlus2, FolderOpen, MousePointer2, RectangleHorizontal, Redo2, Save, SaveAll, TrainFront, Undo2, X, LoaderCircle, Check, Keyboard, GitBranch } from 'lucide-react';
import { createProject, fitBackground, type Color, type WagonKind, type Point, type Project } from './model';
import { exportSvg } from './scene';
import { pngDimensions, rasterizeSvg } from './png';
import { useEditor } from './useEditor';
import Board, { type Tool } from './Board';
import Inspector from './Inspector';
import ExportDialog from './ExportDialog';
import { formatNumber } from './Fields';
import { disconnect, generateArc, generateParallel, insertGenerated, removeObject, complete } from './routes';
import RoutePanel, { newDraft, type Draft, type LinkSelection } from './RoutePanel';

export default function App() {
  const editor = useEditor();
  const [labelSizePreview, setLabelSizePreview] = useState<number>();
  const boardSizes = useMemo(() => labelSizePreview === undefined ? editor.project.sizes
    : { ...editor.project.sizes, cityLabelFontSize: labelSizePreview }, [editor.project.sizes, labelSizePreview]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState<Color>('gray');
  const [wagonKind, setWagonKind] = useState<WagonKind>('regular');
  const [path, setPath] = useState<string | null>(null);
  const [saved, setSaved] = useState(editor.project);
  const [backgroundMode, setBackgroundMode] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const closeRef = useRef(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [help, setHelp] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedLink, setSelectedLink] = useState<LinkSelection | null>(null);
  const selectedRoute = selectedLink ? editor.project.routes.find(r => r.id === selectedLink.routeId) : editor.project.routes.find(r => r.wagons.some(w => w.wagonId === selectedId));
  const curve = useMemo(() => {
    if (draft?.kind !== 'arc') return null;
    const a = editor.project.objects.find(o => o.id === draft.startCityId && o.type === 'city');
    const b = editor.project.objects.find(o => o.id === draft.endCityId && o.type === 'city');
    return a && b ? { a, b } : null;
  }, [draft, editor.project.objects]);
  const control = curve && draft?.kind === 'arc' ? draft.control ?? { x: (curve.a.x + curve.b.x) / 2, y: (curve.a.y + curve.b.y) / 2 } : null;
  const generation = useMemo(() => {
    if (!draft) return { preview: null, error: '' };
    try {
      if (draft.kind === 'parallel') return { preview: generateParallel(editor.project, draft.sourceId, draft.gap, draft.side, draft.color), error: '' };
      if (!draft.startCityId || !draft.endCityId || !control) return { preview: null, error: 'Выберите два города для предварительного просмотра.' };
      return { preview: generateArc(editor.project, draft.startCityId, draft.endCityId, draft.count, control, draft.color), error: '' };
    } catch (error) { return { preview: null, error: (error as Error).message }; }
  }, [draft, editor.project, control?.x, control?.y]);
  const dirty = saved !== editor.project;
  useEffect(() => {
    if (!backgroundMode && (tool === 'route' || tool === 'wagon' || (tool === 'select' && selectedId))) {
      document.querySelector('.inspector-scroll')?.scrollTo({ top: 0 });
    }
  }, [tool, draft?.kind, selectedId, backgroundMode]);
  const name = path ? path.split(/[\\/]/).at(-1)!.replace(/(\.ttrmap)?\.json$/i, '') : 'Новая карта';
  const notify = (text: string, error = false) => setNotice({ text, error });
  useEffect(() => { window.desktop.setDirty(dirty); document.title = `${dirty ? '• ' : ''}${name} — TtR Map Builder`; }, [dirty, name]);
  useEffect(() => { if (!notice || notice.error) return; const timer = setTimeout(() => setNotice(null), 4500); return () => clearTimeout(timer); }, [notice]);
  async function run<T>(label: string, action: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label);
    try { return await action(); }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось выполнить операцию.', true); }
    finally { busyRef.current = false; setBusy(''); }
  }
  async function save(saveAs = false): Promise<boolean> {
    const snapshot = editor.current();
    const result = await window.desktop.saveProject(snapshot, saveAs);
    if (!result.ok) throw new Error(result.error);
    if (!result.value) return false;
    setPath(result.value); setSaved(snapshot); window.desktop.setDirty(false);
    notify('Проект сохранён'); return true;
  }
  async function mayReplace(): Promise<boolean> {
    if (saved === editor.current()) return true;
    const choice = await window.desktop.confirmUnsaved();
    if (choice === 'cancel') return false;
    if (choice === 'save') return save();
    return true;
  }
  function reset(project: Project, filename: string | null) {
    setLabelSizePreview(undefined);
    setDraft(null); setSelectedLink(null);
    editor.reset(project); setSaved(project); setPath(filename); setSelectedId(null); setBackgroundMode(false); setTool('select'); setFitToken(value => value + 1);
  }
  const newProject = () => run('Создание проекта…', async () => {
    if (!await mayReplace()) return;
    await window.desktop.resetPath(); reset(createProject(), null); notify('Создано пустое поле');
  });
  const openProject = () => run('Открытие проекта…', async () => {
    if (!await mayReplace()) return;
    const result = await window.desktop.openProject();
    if (!result.ok) throw new Error(result.error);
    if (result.value) { reset(result.value.project, result.value.path); notify('Проект открыт'); }
  });
  const importImage = () => run('Загрузка подложки…', async () => {
    const result = await window.desktop.importImage();
    if (!result.ok) throw new Error(result.error);
    if (result.value) { const asset = result.value; editor.edit(p => ({ ...p, background: fitBackground(asset, p.board) })); setBackgroundMode(false); notify('Подложка добавлена'); }
  });
  async function performExport(format: 'svg' | 'png', dpi: number, includeBackground: boolean) {
    setExportOpen(false);
    await run(`Подготовка ${format.toUpperCase()}…`, async () => {
      const snapshot = editor.current();
      const svg = exportSvg(snapshot, includeBackground);
      let data: string | Uint8Array = svg;
      if (format === 'png') {
        const { width, height } = pngDimensions(snapshot.board.width, snapshot.board.height, dpi);
        data = await rasterizeSvg(svg, width, height, dpi);
      }
      const result = await window.desktop.exportFile(format, data);
      if (!result.ok) throw new Error(result.error);
      if (result.value) notify(`${format.toUpperCase()} сохранён: ${result.value}`);
    });
  }
  function remove() {
    if (selectedLink) {
      editor.edit(p => disconnect(p, selectedLink.routeId, selectedLink.slot)); setSelectedLink(null); return;
    }
    if (!selectedId) return;
    editor.edit(p => removeObject(p, selectedId)); setSelectedId(null);
  }
  function duplicate() {
    const selected = editor.current().objects.find(o => o.id === selectedId);
    if (!selected) return;
    const object = { ...selected, id: crypto.randomUUID(), x: selected.x + 5, y: selected.y + 5 };
    editor.edit(p => ({ ...p, objects: [...p.objects, object] })); selectObject(object.id); chooseTool('select');
  }
  function chooseTool(next: Tool) { setTool(next); setBackgroundMode(false); setDraft(next === 'route' ? newDraft(color) : null); }
  function selectObject(id: string | null) { setSelectedId(id); setSelectedLink(null); }
  function selectLink(link: LinkSelection) { setSelectedId(null); setSelectedLink(link); }
  function pickCity(id: string) {
    if (draft?.kind === 'parallel') return;
    const d = draft?.kind === 'arc' ? draft : newDraft(color) as Extract<Draft, { kind: 'arc' }>;
    setDraft(!d.startCityId || d.endCityId ? { ...d, startCityId: id, endCityId: '', control: null } : { ...d, endCityId: id, control: null });
  }
  function createRoute() {
    if (!generation.preview) return;
    try {
      editor.edit(p => insertGenerated(p, generation.preview!));
      selectObject(editor.current().routes.at(-1)!.wagons[0].wagonId);
      setDraft(null); setTool('select'); notify('Маршрут создан');
    } catch (error) { notify((error as Error).message, true); }
  }
  useEffect(() => window.desktop.onCloseRequested(() => {
    if (closeRef.current || busyRef.current) return;
    (document.activeElement as HTMLElement)?.blur();
    closeRef.current = true;
    void run('Закрытие проекта…', async () => { if (await mayReplace()) window.desktop.finishClose(); }).finally(() => { closeRef.current = false; });
  }));
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (busyRef.current || exportOpen || help) return;
      const input = event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName);
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && ['KeyS', 'KeyO', 'KeyN'].includes(event.code)) {
        event.preventDefault(); (document.activeElement as HTMLElement)?.blur();
        queueMicrotask(() => { if (event.code === 'KeyS') void run('Сохранение проекта…', () => save(event.shiftKey)); if (event.code === 'KeyO') void openProject(); if (event.code === 'KeyN') void newProject(); });
        return;
      }
      if (input) return;
      if (ctrl && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? editor.redo() : editor.undo(); }
      else if (ctrl && event.code === 'KeyY') { event.preventDefault(); editor.redo(); }
      else if (ctrl && event.code === 'KeyD') { event.preventDefault(); duplicate(); }
      else if (event.code === 'Delete' || event.code === 'Backspace') { event.preventDefault(); remove(); }
      else if (event.code === 'Escape') { chooseTool('select'); selectObject(null); }
      else if (!ctrl && event.code === 'KeyV') chooseTool('select');
      else if (!ctrl && event.code === 'KeyC') chooseTool('city');
      else if (!ctrl && event.code === 'KeyW') chooseTool('wagon');
      else if (!ctrl && event.code === 'KeyR') chooseTool('route');
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const closeExport = useCallback(() => setExportOpen(false), []);
  const cityCount = editor.project.objects.filter(o => o.type === 'city').length;
  const wagonCount = editor.project.objects.length - cityCount;
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><div className="brand-mark"><TrainFront size={25} strokeWidth={1.7} /></div><div><strong>MAP BUILDER</strong><span>TICKET TO RIDE</span></div></div>
      <div className="document-name"><span className={dirty ? 'dirty-dot' : 'saved-dot'} /><strong title={name}>{name}</strong><span>{dirty ? 'Есть изменения' : path ? 'Сохранено' : 'Новый проект'}</span></div>
      <button className="help-button" title="Горячие клавиши" aria-label="Горячие клавиши" onClick={() => setHelp(true)}><Keyboard size={20} /></button><span className="version-tag">DESKTOP / 1.2.7</span>
    </header>
    <div className="toolbar">
      <div className="toolbar-group"><button title="Новый проект (Ctrl+N)" onClick={newProject}><FilePlus2 size={17} /><span>Новый</span></button><button title="Открыть проект (Ctrl+O)" onClick={openProject}><FolderOpen size={17} /><span>Открыть</span></button><button title="Сохранить (Ctrl+S)" onClick={() => void run('Сохранение проекта…', () => save())}><Save size={17} /><span>Сохранить</span></button><button title="Сохранить как (Ctrl+Shift+S)" onClick={() => void run('Сохранение проекта…', () => save(true))}><SaveAll size={17} /><span>Сохранить как</span></button></div>
      <div className="toolbar-divider" /><div className="toolbar-group"><button aria-label="Отменить" title="Отменить (Ctrl+Z)" disabled={!editor.canUndo} onClick={editor.undo}><Undo2 size={18} /></button><button aria-label="Повторить" title="Повторить (Ctrl+Y)" disabled={!editor.canRedo} onClick={editor.redo}><Redo2 size={18} /></button></div>
      <div className="toolbar-spacer" /><span className="toolbar-note">Ваша карта. Ваши маршруты.</span><button className="primary-button" onClick={() => setExportOpen(true)}><Download size={16} />Экспорт</button>
    </div>
    <main className="editor-layout">
      <nav className="tool-rail" aria-label="Инструменты"><span className="rail-label">ИНСТРУМЕНТЫ</span>
        <button className={tool === 'select' && !backgroundMode ? 'active' : ''} aria-label="Выделение" title="Выделение (V)" onClick={() => chooseTool('select')}><MousePointer2 size={22} /><span>Выделение</span><kbd>V</kbd></button>
        <button className={tool === 'city' && !backgroundMode ? 'active' : ''} aria-label="Город" title="Добавить город (C)" onClick={() => chooseTool('city')}><Circle size={24} /><span>Город</span><kbd>C</kbd></button>
        <button className={tool === 'wagon' && !backgroundMode ? 'active' : ''} aria-label="Вагон" title="Добавить вагон (W)" onClick={() => chooseTool('wagon')}><RectangleHorizontal size={27} /><span>Вагон</span><kbd>W</kbd></button>
        <button className={tool === 'route' && !backgroundMode ? 'active' : ''} aria-label="Маршрут" title="Маршрут по дуге (R)" onClick={() => chooseTool('route')}><GitBranch size={24} /><span>Маршрут</span><kbd>R</kbd></button>
        <div className="rail-bottom"><span className="rail-track"><i /><i /><i /></span><span>СОЗДАВАЙТЕ<br />СВОИ МАРШРУТЫ</span></div>
      </nav>
      <Board editor={editor} displaySizes={boardSizes} tool={tool} color={color} wagonKind={wagonKind} selectedId={selectedId} onSelect={selectObject} backgroundMode={backgroundMode} fitToken={fitToken} onCursor={setCursor}
        selectedLink={selectedLink} onSelectLink={selectLink} onPickCity={pickCity} control={control} onControl={point => setDraft(d => d?.kind === 'arc' ? { ...d, control: point } : d)} curve={curve} preview={generation.preview} />
      <Inspector editor={editor} onLabelSizePreview={setLabelSizePreview} tool={tool} selectedId={selectedId} color={color} setColor={setColor} wagonKind={wagonKind} setWagonKind={setWagonKind} backgroundMode={backgroundMode} setBackgroundMode={value => { setBackgroundMode(value); if (value) { setTool('select'); setDraft(null); } }} importImage={importImage} duplicate={duplicate} remove={remove}
        routePanel={!backgroundMode && <RoutePanel editor={editor} active={tool === 'route'} draft={draft} setDraft={setDraft} preview={generation.preview} error={generation.error} route={selectedRoute} link={selectedLink} onCreate={createRoute} onCancel={() => chooseTool('select')} onParallel={route => { setTool('route'); setBackgroundMode(false); setDraft({ kind: 'parallel', sourceId: route.id, gap: 4, side: 1, color }); }} onDisconnect={remove} onDismantle={id => { editor.edit(p => ({ ...p, routes: p.routes.filter(r => r.id !== id) })); setSelectedLink(null); }} />} />
    </main>
    <footer className="statusbar"><div><span className="status-indicator" />{busy || (tool === 'route' ? 'Создание маршрутов' : tool === 'city' ? 'Добавление городов' : tool === 'wagon' ? 'Добавление вагонов' : 'Готово к работе')}</div><div className="object-counts"><span><Circle size={11} />Городов: {cityCount}</span><span><RectangleHorizontal size={14} />Вагонов: {wagonCount}</span><span><GitBranch size={13} />Маршрутов: {editor.project.routes.filter(complete).length}</span></div><div className="cursor-coordinates">{cursor ? `X ${formatNumber(cursor.x, 1)} · Y ${formatNumber(cursor.y, 1)} мм` : 'Все размеры в миллиметрах'}</div></footer>
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.error ? <X size={18} /> : <Check size={18} />}<span>{notice.text}</span><button aria-label="Скрыть уведомление" onClick={() => setNotice(null)}><X size={15} /></button></div>}
    {exportOpen && <ExportDialog project={editor.project} close={closeExport} onExport={performExport} />}
    {help && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setHelp(false); }}><div className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="dialog-heading"><h2 id="help-title">Горячие клавиши</h2><button autoFocus aria-label="Закрыть подсказку" onClick={() => setHelp(false)}><X size={20} /></button></div>{[['V / C / W', 'Выделение / город / вагон'], ['R', 'Создать маршрут по дуге'], ['Ctrl+S', 'Сохранить проект'], ['Ctrl+Shift+S', 'Сохранить как'], ['Ctrl+O / Ctrl+N', 'Открыть / новый проект'], ['Ctrl+Z / Ctrl+Y', 'Отмена / повтор'], ['Ctrl+D / Delete', 'Дублировать / удалить'], ['Пробел + мышь', 'Перемещение рабочей области'], ['Колёсико', 'Масштаб относительно курсора'], ['Shift + вращение', 'Поворот с шагом 15°'], ['Esc', 'Вернуться к выделению']].map(([keys, text]) => <div className="shortcut" key={keys}><kbd>{keys}</kbd><span>{text}</span></div>)}<p className="field-hint">При печати выбирайте фактический размер / 100%. Масштаб на экране предназначен для удобства редактирования.</p></div></div>}
    {busy && <div className="busy-overlay" role="status"><LoaderCircle className="spinner" size={23} /><span>{busy}</span></div>}
  </div>;
}
