import { Circle, Copy, ImagePlus, Map, RectangleHorizontal, SlidersHorizontal, Trash2, X, Move, Scan } from 'lucide-react';
import type { Editor } from './useEditor';
import { fitBackground, normalizeAngle, type Color, type MapObject } from './model';
import { NumberField, Palette, TextField } from './Fields';

export default function Inspector({ editor, selectedId, color, setColor, backgroundMode, setBackgroundMode, importImage, duplicate, remove }: {
  editor: Editor; selectedId: string | null; color: Color; setColor: (value: Color) => void;
  backgroundMode: boolean; setBackgroundMode: (value: boolean) => void; importImage: () => void; duplicate: () => void; remove: () => void;
}) {
  const project = editor.project;
  const selected = project.objects.find(object => object.id === selectedId);
  function changeObject(update: (object: MapObject) => MapObject) {
    editor.edit(current => ({ ...current, objects: current.objects.map(object => object.id === selectedId ? update(object) : object) }));
  }
  function changeBackground(values: Partial<NonNullable<typeof project.background>>) {
    editor.edit(current => ({ ...current, background: current.background ? { ...current.background, ...values } : null }));
  }
  const bg = project.background;
  const fitted = bg ? fitBackground(bg, project.board) : null;
  return <aside className="inspector">
    <div className="inspector-heading"><SlidersHorizontal size={17} /><h2>Параметры</h2><span>мм</span></div>
    <div className="inspector-scroll">
      <section><h3><Map size={15} />Игровое поле</h3><div className="field-row">
        <NumberField label="Длина поля" value={project.board.width} positive onChange={width => editor.edit(p => ({ ...p, board: { ...p.board, width } }))} />
        <NumberField label="Ширина поля" value={project.board.height} positive onChange={height => editor.edit(p => ({ ...p, board: { ...p.board, height } }))} />
      </div><p className="field-hint">Размер готового поля при печати</p></section>
      <section><h3><RectangleHorizontal size={15} />Вагоны</h3><div className="field-row">
        <NumberField label="Длина вагона" value={project.sizes.wagonLength} positive onChange={wagonLength => editor.edit(p => ({ ...p, sizes: { ...p.sizes, wagonLength } }))} />
        <NumberField label="Ширина вагона" value={project.sizes.wagonWidth} positive onChange={wagonWidth => editor.edit(p => ({ ...p, sizes: { ...p.sizes, wagonWidth } }))} />
      </div><label className="small-label">Цвет новых вагонов</label><Palette value={color} onChange={setColor} /></section>
      <section><h3><Circle size={15} />Города</h3><NumberField label="Диаметр города" value={project.sizes.cityDiameter} positive onChange={cityDiameter => editor.edit(p => ({ ...p, sizes: { ...p.sizes, cityDiameter } }))} /><p className="field-hint">Размеры применяются ко всем объектам</p></section>
      <section className={selected && !backgroundMode ? 'object-section' : 'no-selection'}>
        <h3>{selected && !backgroundMode ? selected.type === 'city' ? 'Выбран город' : 'Выбран вагон' : 'Свойства объекта'}{selected && !backgroundMode && <span className="section-actions"><button title="Дублировать (Ctrl+D)" aria-label="Дублировать" onClick={duplicate}><Copy size={14} /></button><button title="Удалить (Delete)" aria-label="Удалить объект" onClick={remove}><Trash2 size={14} /></button></span>}</h3>
        {selected && !backgroundMode ? <>
          <div className="field-row"><NumberField label="X объекта" value={selected.x} onChange={x => changeObject(o => ({ ...o, x }))} /><NumberField label="Y объекта" value={selected.y} onChange={y => changeObject(o => ({ ...o, y }))} /></div>
          {selected.type === 'wagon' ? <><NumberField label="Угол поворота" value={selected.angle} min={0} max={360} unit="°" onChange={angle => changeObject(o => o.type === 'wagon' ? { ...o, angle: normalizeAngle(angle) } : o)} /><label className="small-label">Цвет выбранного вагона</label><Palette value={selected.color} onChange={color => changeObject(o => o.type === 'wagon' ? { ...o, color } : o)} /><p className="field-hint">Круглая ручка над вагоном — вращение.<br />Shift при вращении — шаг 15°.</p></>
            : <><TextField label="Название города" value={selected.name} placeholder="Например, Санкт-Петербург" onChange={name => changeObject(o => o.type === 'city' ? { ...o, name } : o)} />{selected.name && <><div className="field-row"><NumberField label="Смещение подписи X" value={selected.labelOffset.x} onChange={x => changeObject(o => o.type === 'city' ? { ...o, labelOffset: { ...o.labelOffset, x } } : o)} /><NumberField label="Смещение подписи Y" value={selected.labelOffset.y} onChange={y => changeObject(o => o.type === 'city' ? { ...o, labelOffset: { ...o.labelOffset, y } } : o)} /></div><p className="field-hint">Подпись можно перетащить мышью.</p></>}</>}
        </> : <p className="field-hint">Выберите город или вагон на поле,<br />чтобы изменить его свойства.</p>}
      </section>
      <section className="background-section"><h3><ImagePlus size={15} />Подложка</h3>
        {!bg ? <><p className="field-hint">Добавьте свою карту или иллюстрацию под игровое поле.</p><button className="outline-button wide" onClick={importImage}><ImagePlus size={16} />Загрузить PNG / JPEG</button></>
          : <><div className="background-file"><ImagePlus size={16} /><span title={bg.name}>{bg.name}</span><button title="Удалить подложку" aria-label="Удалить подложку" onClick={() => { editor.edit(p => ({ ...p, background: null })); setBackgroundMode(false); }}><X size={15} /></button></div>
            <label className="checkbox"><input type="checkbox" checked={bg.visible} onChange={event => changeBackground({ visible: event.target.checked })} />Показывать подложку</label>
            <button className={`outline-button wide ${backgroundMode ? 'active' : ''}`} onClick={() => setBackgroundMode(!backgroundMode)}><Move size={15} />{backgroundMode ? 'Завершить перемещение' : 'Переместить подложку'}</button>
            <div className="field-row"><NumberField label="X подложки" value={bg.x} onChange={x => changeBackground({ x })} /><NumberField label="Y подложки" value={bg.y} onChange={y => changeBackground({ y })} /></div>
            <div className="field-row"><NumberField label="Масштаб к полю" value={bg.width / fitted!.width * 100} unit="%" positive onChange={percent => changeBackground({ width: fitted!.width * percent / 100, height: fitted!.height * percent / 100 })} /><NumberField label="Непрозрачность" value={bg.opacity * 100} unit="%" min={0} max={100} onChange={value => changeBackground({ opacity: value / 100 })} /></div>
            <div className="background-actions"><button className="text-button" onClick={() => changeBackground({ x: fitted!.x, y: fitted!.y, width: fitted!.width, height: fitted!.height })}><Scan size={14} />Вписать</button><button className="text-button" onClick={importImage}>Заменить</button></div>
          </>}
      </section>
    </div>
    <div className="inspector-footer"><span />Векторное поле · Точные размеры</div>
  </aside>;
}
