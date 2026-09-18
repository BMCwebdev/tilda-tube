import React, { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { btn, card, colors, input, label } from '../lib/styles';
import { DatePresetPicker, dateFromPreset, MinLengthSelect, QualitySelect, type DatePreset } from './DatePresetPicker';

interface Props {
  onAdded: (name: string) => void;
}

export function AddChannelForm({ onAdded }: Props) {
  const [url, setUrl] = useState('');
  const [preset, setPreset] = useState<DatePreset>('1year');
  const [customDate, setCustomDate] = useState(new Date().toISOString().slice(0, 10));
  const [autoApprove, setAutoApprove] = useState(true);
  const [minDuration, setMinDuration] = useState(120);
  const [maxQuality, setMaxQuality] = useState(720);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fromDate = dateFromPreset(preset, customDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const ch = await api<{ name: string }>('/api/channels', {
        method: 'POST',
        json: { url: url.trim(), fromDate, autoApprove, minDuration, maxQuality },
      });
      onAdded(ch.name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ ...card, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={label}>YouTube channel link</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/@SesameStreet"
          style={{ ...input, width: '100%' }}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          required
        />
        <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>Any channel page link works: @handle, /channel/UC…, or a link to one of its videos.</div>
      </div>

      <div>
        <label style={label}>How far back</label>
        <DatePresetPicker preset={preset} customDate={customDate} onChange={(p, d) => { setPreset(p); setCustomDate(d); }} />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={label}>Short videos</label>
          <MinLengthSelect value={minDuration} onChange={setMinDuration} />
        </div>
        <div style={{ flex: '0 1 120px' }}>
          <label style={label}>Quality</label>
          <QualitySelect value={maxQuality} onChange={setMaxQuality} />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
        <span>
          <strong>Auto-download new videos</strong>
          <div style={{ fontSize: 12, color: colors.muted }}>Off means every new video waits in the Queue for you to approve it.</div>
        </span>
      </label>

      {error && <div style={{ color: colors.danger, fontSize: 13, fontWeight: 500 }}>{error}</div>}

      <button type="submit" disabled={submitting} style={{ ...btn('primary', { disabled: submitting }), alignSelf: 'flex-start' }}>
        {submitting ? 'Looking up channel…' : 'Add channel'}
      </button>
    </form>
  );
}
