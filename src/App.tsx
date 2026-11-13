import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Download, FilePlus2, FolderOpen, MousePointer2, RectangleHorizontal, Redo2, Save, SaveAll, TrainFront, Undo2, X, LoaderCircle, Check, Keyboard } from 'lucide-react';
import { createProject, fitBackground, type Color, type Point, type ProjectV1 } from './model';
import { exportSvg } from './scene';
import { pngDimensions, rasterizeSvg } from './png';
import { useEditor } from './useEditor';
import Board, { type Tool } from './Board';
import Inspector from './Inspector';
import ExportDialog from './ExportDialog';
import { formatNumber } from './Fields';

export default function App() {
  const editor = useEditor();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState<Color>('gray');
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
  const dirty = saved !== editor.project;
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
  function reset(project: ProjectV1, filename: string | null) {
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
    if (!selectedId) return;
    editor.edit(p => ({ ...p, objects: p.objects.filter(o => o.id !== selectedId) })); setSelectedId(null);
  }
  function duplicate() {
    const selected = editor.current().objects.find(o => o.id === selectedId);
    if (!selected) return;
    const object = { ...selected, id: crypto.randomUUID(), x: selected.x + 5, y: selected.y + 5 };
    editor.edit(p => ({ ...p, objects: [...p.objects, object] })); setSelectedId(object.id); setTool('select');
  }
  function chooseTool(next: Tool) { setTool(next); setBackgroundMode(false); }
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
      else if (event.code === 'Escape') { chooseTool('select'); setSelectedId(null); }
      else if (!ctrl && event.code === 'KeyV') chooseTool('select');
      else if (!ctrl && event.code === 'KeyC') chooseTool('city');
      else if (!ctrl && event.code === 'KeyW') chooseTool('wagon');
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
      <button className="help-button" title="Горячие клавиши" aria-label="Горячие клавиши" onClick={() => setHelp(true)}><Keyboard size={20} /></button><span className="version-tag">DESKTOP / 1.0</span>
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
        <div className="rail-bottom"><span className="rail-track"><i /><i /><i /></span><span>СОЗДАВАЙТЕ<br />СВОИ МАРШРУТЫ</span></div>
      </nav>
      <Board editor={editor} tool={tool} color={color} selectedId={selectedId} onSelect={setSelectedId} backgroundMode={backgroundMode} fitToken={fitToken} onCursor={setCursor} />
      <Inspector editor={editor} selectedId={selectedId} color={color} setColor={setColor} backgroundMode={backgroundMode} setBackgroundMode={value => { setBackgroundMode(value); if (value) setTool('select'); }} importImage={importImage} duplicate={duplicate} remove={remove} />
    </main>
    <footer className="statusbar"><div><span className="status-indicator" />{busy || (tool === 'city' ? 'Добавление городов' : tool === 'wagon' ? 'Добавление вагонов' : 'Готово к работе')}</div><div className="object-counts"><span><Circle size={11} />Городов: {cityCount}</span><span><RectangleHorizontal size={14} />Вагонов: {wagonCount}</span></div><div className="cursor-coordinates">{cursor ? `X ${formatNumber(cursor.x, 1)} · Y ${formatNumber(cursor.y, 1)} мм` : 'Все размеры в миллиметрах'}</div></footer>
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.error ? <X size={18} /> : <Check size={18} />}<span>{notice.text}</span><button aria-label="Скрыть уведомление" onClick={() => setNotice(null)}><X size={15} /></button></div>}
    {exportOpen && <ExportDialog project={editor.project} close={closeExport} onExport={performExport} />}
    {help && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setHelp(false); }}><div className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="dialog-heading"><h2 id="help-title">Горячие клавиши</h2><button autoFocus aria-label="Закрыть подсказку" onClick={() => setHelp(false)}><X size={20} /></button></div>{[['V / C / W', 'Выделение / город / вагон'], ['Ctrl+S', 'Сохранить проект'], ['Ctrl+Shift+S', 'Сохранить как'], ['Ctrl+O / Ctrl+N', 'Открыть / новый проект'], ['Ctrl+Z / Ctrl+Y', 'Отмена / повтор'], ['Ctrl+D / Delete', 'Дублировать / удалить'], ['Пробел + мышь', 'Перемещение рабочей области'], ['Колёсико', 'Масштаб относительно курсора'], ['Shift + вращение', 'Поворот с шагом 15°'], ['Esc', 'Вернуться к выделению']].map(([keys, text]) => <div className="shortcut" key={keys}><kbd>{keys}</kbd><span>{text}</span></div>)}<p className="field-hint">При печати выбирайте фактический размер / 100%. Масштаб на экране предназначен для удобства редактирования.</p></div></div>}
    {busy && <div className="busy-overlay" role="status"><LoaderCircle className="spinner" size={23} /><span>{busy}</span></div>}
  </div>;
}
