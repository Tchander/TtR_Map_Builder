import { useEffect, useState } from 'react';
import { CITY_STYLE_NAMES, cityStyleSchema, PALETTE, type CityStyle, type Color, type WagonKind } from './model';

export const formatNumber = (value: number, digits = 2) => Number(value.toFixed(digits)).toLocaleString('ru-RU', { maximumFractionDigits: digits, useGrouping: false });
export function NumberField({ label, value, onChange, onPreview, unit = 'мм', positive = false, min, max, disabled = false }: {
  label: string; value: number; onChange: (value: number) => void; onPreview?: (value: number | undefined) => void;
  unit?: string; positive?: boolean; min?: number; max?: number; disabled?: boolean;
}) {
  const [text, setText] = useState(formatNumber(value, 4));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(formatNumber(value, 4)); setInvalid(false); }, [value]);
  function parse(input: string) {
    const parsed = Number(input.trim().replace(',', '.'));
    if (!input.trim() || !Number.isFinite(parsed) || (positive && parsed <= 0) || (min !== undefined && parsed < min) || (max !== undefined && parsed > max)) return undefined;
    return parsed;
  }
  function apply() {
    const parsed = parse(text);
    onPreview?.(undefined);
    if (parsed === undefined) {
      setText(formatNumber(value, 4)); setInvalid(true); return;
    }
    setInvalid(false);
    if (parsed !== value) onChange(parsed);
    else setText(formatNumber(value, 4));
  }
  return <label className={`number-field ${invalid ? 'invalid' : ''}`}>
    <span>{label}</span><div><input aria-label={label} type="text" inputMode="decimal" value={text} disabled={disabled} aria-invalid={invalid}
      onChange={event => { setText(event.target.value); setInvalid(false); onPreview?.(parse(event.target.value)); }} onBlur={apply}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setText(formatNumber(value, 4)); setInvalid(false); onPreview?.(undefined); event.stopPropagation(); } }} /><small>{unit}</small></div>
    {invalid && <em>Введите допустимое число</em>}
  </label>;
}
export function TextField({ label, value, onChange, placeholder, autoFocus }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return <label className="text-field"><span>{label}</span><input autoFocus={autoFocus} aria-label={label} value={text} maxLength={120} placeholder={placeholder}
    onChange={event => setText(event.target.value)} onBlur={() => { if (text !== value) onChange(text); }}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setText(value); event.stopPropagation(); } }} /></label>;
}
export function WagonKindField({ label, value, onChange }: { label: string; value: WagonKind; onChange: (value: WagonKind) => void }) {
  return <label className="route-select">{label}
    <select value={value} onChange={event => onChange(event.target.value as WagonKind)}>
      <option value="regular">Обычный</option>
      <option value="locomotive">Локомотив</option>
      <option value="tunnel">Тоннель</option>
    </select>
  </label>;
}
export function CityStyleField({ label, value, onChange }: { label: string; value: CityStyle; onChange: (style: CityStyle) => void }) {
  return <div className="city-styles" role="group" aria-label={label}>
    <span className="small-label">{label} · {CITY_STYLE_NAMES[value]}</span>
    <div className="palette">{cityStyleSchema.options.map(style => <button type="button" className={`swatch ${value === style ? 'chosen' : ''}`}
      key={style} aria-pressed={value === style} title={CITY_STYLE_NAMES[style]} aria-label={CITY_STYLE_NAMES[style]} onClick={() => onChange(style)}>
      <svg viewBox="-6 -6 12 12" width="20" height="20" aria-hidden="true">
        {style === 'classic' ? <circle r="4.75" fill="white" stroke="#34383e" strokeWidth=".5"/> : <use href={`#city-marker-${style}`}/>}
      </svg>
    </button>)}</div>
  </div>;
}
export function Palette({ value, onChange, disabled = false }: { disabled?: boolean; value: Color; onChange: (value: Color) => void }) {
  return <div className="palette" role="group" aria-label="Цвет вагона">{PALETTE.map(color => <button key={color.id} type="button" title={color.name} aria-label={color.name}
    disabled={disabled} aria-pressed={value === color.id} className={`swatch ${value === color.id ? 'chosen' : ''}`} onClick={() => onChange(color.id)}
    style={{ '--swatch': color.hex } as React.CSSProperties}><span /></button>)}</div>;
}
