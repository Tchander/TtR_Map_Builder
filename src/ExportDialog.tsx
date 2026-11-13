import { useEffect, useState } from 'react';
import { Download, FileImage, FileCode2, X } from 'lucide-react';
import type { ProjectV1 } from './model';
import { pngDimensions } from './png';

export default function ExportDialog({ project, close, onExport }: { project: ProjectV1; close: () => void; onExport: (format: 'svg' | 'png', dpi: number, includeBackground: boolean) => void }) {
  const [format, setFormat] = useState<'svg' | 'png'>('svg');
  const [dpi, setDpi] = useState(300);
  const [includeBackground, setIncludeBackground] = useState(true);
  let dimensions = '', error = '';
  try { const pixels = pngDimensions(project.board.width, project.board.height, dpi); dimensions = `${pixels.width.toLocaleString('ru-RU')} × ${pixels.height.toLocaleString('ru-RU')} px`; }
  catch (value) { error = (value as Error).message; }
  useEffect(() => {
    function key(event: KeyboardEvent) { if (event.key === 'Escape') close(); }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [close]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div className="dialog-heading"><div><span className="eyebrow">ГОТОВО К ПЕЧАТИ</span><h2 id="export-title">Экспорт поля</h2></div><button aria-label="Закрыть экспорт" onClick={close}><X size={20} /></button></div>
      <p className="dialog-description">Всё поле в заданном размере. Без рамок выделения и элементов редактора.</p>
      <div className="format-options"><button autoFocus className={format === 'svg' ? 'chosen' : ''} onClick={() => setFormat('svg')}><FileCode2 size={24} /><strong>SVG</strong><span>Вектор · Любой масштаб</span></button><button className={format === 'png' ? 'chosen' : ''} onClick={() => setFormat('png')}><FileImage size={24} /><strong>PNG</strong><span>Изображение · Для печати</span></button></div>
      {format === 'png' && <label className="dpi-select">Разрешение<select aria-label="Разрешение PNG" value={dpi} onChange={event => setDpi(Number(event.target.value))}><option value={96}>96 DPI — экран</option><option value={150}>150 DPI — черновик</option><option value={300}>300 DPI — печать</option></select></label>}
      <div className="export-size"><span>Размер экспорта</span><strong>{format === 'svg' ? `${project.board.width} × ${project.board.height} мм` : dimensions || 'Превышен лимит'}</strong></div>
      {project.background && <label className="checkbox"><input type="checkbox" checked={includeBackground} onChange={event => setIncludeBackground(event.target.checked)} />Включить подложку{!project.background.visible && <small> (сейчас скрыта)</small>}</label>}
      {format === 'png' && error && <p className="error-message">{error}</p>}
      <div className="dialog-footer"><button className="outline-button" onClick={close}>Отмена</button><button className="primary-button" disabled={format === 'png' && !!error} onClick={() => onExport(format, dpi, includeBackground)}><Download size={17} />Сохранить {format.toUpperCase()}</button></div>
    </div>
  </div>;
}
