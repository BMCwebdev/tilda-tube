import React from 'react';
import { colors, input } from '../lib/styles';

export type DatePreset = '6months' | '1year' | '2years' | 'all' | 'custom';

export const ALL_TIME = '2005-01-01';

export function dateFromPreset(preset: DatePreset, customDate: string): string {
  const now = new Date();
  switch (preset) {
    case '6months': now.setMonth(now.getMonth() - 6); break;
    case '1year': now.setFullYear(now.getFullYear() - 1); break;
    case '2years': now.setFullYear(now.getFullYear() - 2); break;
    case 'all': return ALL_TIME;
    case 'custom': return customDate;
  }
  return now.toISOString().slice(0, 10);
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: '6months', label: 'Last 6 months' },
  { key: '1year', label: 'Last year' },
  { key: '2years', label: 'Last 2 years' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Pick a date' },
];

interface Props {
  preset: DatePreset;
  customDate: string;
  onChange: (preset: DatePreset, customDate: string) => void;
  compact?: boolean;
}

export function DatePresetPicker({ preset, customDate, onChange, compact }: Props) {
  const chip = (active: boolean): React.CSSProperties => ({
    padding: compact ? '5px 10px' : '6px 12px',
    border: active ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
    borderRadius: 999,
    background: active ? colors.primarySoft : '#fff',
    color: active ? colors.primary : colors.text,
    cursor: 'pointer',
    fontSize: compact ? 12 : 13,
    fontWeight: active ? 600 : 400,
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button key={p.key} type="button" style={chip(preset === p.key)} onClick={() => onChange(p.key, customDate)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <input
          type="date"
          value={customDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onChange('custom', e.target.value)}
          style={{ ...input, marginTop: 8 }}
          required
        />
      )}
      <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>
        Videos published on or after <strong>{dateFromPreset(preset, customDate)}</strong>
        {preset === 'all' && ' (at most 75 are picked up per pass)'}
      </div>
    </div>
  );
}

export function QualitySelect({ value, onChange, small }: { value: number; onChange: (q: number) => void; small?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ...input, padding: small ? '6px 8px' : input.padding, fontSize: small ? 13 : 14 }}>
      <option value={480}>480p</option>
      <option value={720}>720p</option>
      <option value={1080}>1080p</option>
    </select>
  );
}

export function MinLengthSelect({ value, onChange, small }: { value: number; onChange: (s: number) => void; small?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ...input, padding: small ? '6px 8px' : input.padding, fontSize: small ? 13 : 14 }}>
      <option value={0}>Everything in one folder</option>
      <option value={60}>Under 1 min go to Shorts</option>
      <option value={120}>Under 2 min go to Shorts</option>
      <option value={180}>Under 3 min go to Shorts</option>
      <option value={300}>Under 5 min go to Shorts</option>
    </select>
  );
}
