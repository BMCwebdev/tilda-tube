import React, { useState } from 'react';

interface Props {
  onAdded: () => void;
}

export function AddChannelForm({ onAdded }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [url, setUrl] = useState('');
  const [fromDate, setFromDate] = useState(today);
  const [autoApprove, setAutoApprove] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), fromDate, autoApprove }),
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

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Download videos from
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'end', paddingBottom: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            Auto-approve
          </label>
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
