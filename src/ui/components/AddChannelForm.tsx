import React, { useState } from 'react';

interface Props {
  onAdded: () => void;
}

type DatePreset = '6months' | '1year' | '2years' | 'all' | 'custom';

function getDateFromPreset(preset: DatePreset): string {
  const now = new Date();
  switch (preset) {
    case '6months':
      now.setMonth(now.getMonth() - 6);
      return now.toISOString().split('T')[0];
    case '1year':
      now.setFullYear(now.getFullYear() - 1);
      return now.toISOString().split('T')[0];
    case '2years':
      now.setFullYear(now.getFullYear() - 2);
      return now.toISOString().split('T')[0];
    case 'all':
      return '2005-01-01';
    case 'custom':
      return now.toISOString().split('T')[0];
  }
}

export function AddChannelForm({ onAdded }: Props) {
  const [url, setUrl] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('1year');
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [minDuration, setMinDuration] = useState(120);
  const [maxQuality, setMaxQuality] = useState(720);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fromDate = datePreset === 'custom' ? customDate : getDateFromPreset(datePreset);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), fromDate, autoApprove, minDuration, maxQuality }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to add channel');
        return;
      }

      onAdded();
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 14,
    width: '100%',
  };

  const presetButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    border: active ? '2px solid #2563eb' : '1px solid #ddd',
    borderRadius: 6,
    background: active ? '#eff6ff' : '#fff',
    color: active ? '#2563eb' : '#333',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
  });

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: '#fff',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          YouTube Channel URL
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/@SesameStreet"
          style={inputStyle}
          required
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Download videos from
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setDatePreset('6months')} style={presetButtonStyle(datePreset === '6months')}>
            Last 6 months
          </button>
          <button type="button" onClick={() => setDatePreset('1year')} style={presetButtonStyle(datePreset === '1year')}>
            Last year
          </button>
          <button type="button" onClick={() => setDatePreset('2years')} style={presetButtonStyle(datePreset === '2years')}>
            Last 2 years
          </button>
          <button type="button" onClick={() => setDatePreset('all')} style={presetButtonStyle(datePreset === 'all')}>
            All time
          </button>
          <button type="button" onClick={() => setDatePreset('custom')} style={presetButtonStyle(datePreset === 'custom')}>
            Custom date
          </button>
        </div>
        {datePreset === 'custom' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            style={{ ...inputStyle, marginTop: 8, width: 'auto' }}
            required
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          Auto-approve
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Min length</label>
          <select
            value={minDuration}
            onChange={(e) => setMinDuration(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 13,
              background: '#fff',
            }}
          >
            <option value={0}>No filter</option>
            <option value={60}>1 minute</option>
            <option value={120}>2 minutes</option>
            <option value={180}>3 minutes</option>
            <option value={300}>5 minutes</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Quality</label>
          <select
            value={maxQuality}
            onChange={(e) => setMaxQuality(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 13,
              background: '#fff',
            }}
          >
            <option value={480}>480p</option>
            <option value={720}>720p</option>
            <option value={1080}>1080p</option>
          </select>
        </div>
      </div>

      {error && (
        <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 500 }}>{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: '10px 20px',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: submitting ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 14,
          opacity: submitting ? 0.7 : 1,
          alignSelf: 'flex-start',
        }}
      >
        {submitting ? 'Adding...' : 'Add Channel'}
      </button>
    </form>
  );
}
