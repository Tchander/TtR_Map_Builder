import { useEffect, useState } from 'react';
import { PALETTE, type Color, type WagonKind } from './model';

export const formatNumber = (value: number, digits = 2) => Number(value.toFixed(digits)).toLocaleString('ru-RU', { maximumFractionDigits: digits, useGrouping: false });
export function NumberField({ label, value, onChange, unit = 'мм', positive = false, min, max, disabled = false }: {
  label: string; value: number; onChange: (value: number) => void; unit?: string; positive?: boolean; min?: number; max?: number; disabled?: boolean;
}) {
  const [text, setText] = useState(formatNumber(value, 4));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(formatNumber(value, 4)); setInvalid(false); }, [value]);
  function apply() {
    const parsed = Number(text.trim().replace(',', '.'));
    if (!text.trim() || !Number.isFinite(parsed) || (positive && parsed <= 0) || (min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
      setText(formatNumber(value, 4)); setInvalid(true); return;
    }
    setInvalid(false);
    if (parsed !== value) onChange(parsed);
    else setText(formatNumber(value, 4));
  }
  return <label className={`number-field ${invalid ? 'invalid' : ''}`}>
    <span>{label}</span><div><input aria-label={label} type="text" inputMode="decimal" value={text} disabled={disabled} aria-invalid={invalid}
      onChange={event => { setText(event.target.value); setInvalid(false); }} onBlur={apply}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setText(formatNumber(value, 4)); setInvalid(false); event.stopPropagation(); } }} /><small>{unit}</small></div>
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
export function Palette({ value, onChange, disabled = false }: { disabled?: boolean; value: Color; onChange: (value: Color) => void }) {
  return <div className="palette" role="group" aria-label="Цвет вагона">{PALETTE.map(color => <button key={color.id} type="button" title={color.name} aria-label={color.name}
    disabled={disabled} aria-pressed={value === color.id} className={`swatch ${value === color.id ? 'chosen' : ''}`} onClick={() => onChange(color.id)}
    style={{ '--swatch': color.hex } as React.CSSProperties}><span /></button>)}</div>;
}
