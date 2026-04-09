import { useEffect, useRef, useState } from 'react';
import { Group, Checkbox, Text, TextInput } from '@mantine/core';

const splitCsv = (csv: string): string[] =>
  csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

type Row = { key: string; url: string; enabled: boolean };

const rowsToCsv = (rows: Row[]): string =>
  rows
    .filter((r) => r.enabled && r.url.trim())
    .map((r) => r.url.trim())
    .join(',');

let keySeq = 0;
const nextKey = () => `u-${++keySeq}-${Date.now()}`;

export const UrlListCsvEditor = ({
  label,
  description,
  value,
  onChange,
  addPlaceholder = 'Add URL — Enter',
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (csv: string) => void;
  addPlaceholder?: string;
}) => {
  const lastEmittedRef = useRef<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() =>
    splitCsv(value).map((url) => ({ key: nextKey(), url, enabled: true })),
  );
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (lastEmittedRef.current !== null && value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    setRows(splitCsv(value).map((url) => ({ key: nextKey(), url, enabled: true })));
  }, [value]);

  const toggle = (key: string) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, enabled: !r.enabled } : r));
      const csv = rowsToCsv(next);
      lastEmittedRef.current = csv;
      onChange(csv);
      return next;
    });
  };

  const addFromDraft = () => {
    const raw = draft.trim();
    if (!raw) return;
    const parts = raw.includes(',') ? splitCsv(raw) : [raw];
    setRows((prev) => {
      let next = [...prev];
      for (const u of parts) {
        const url = u.trim();
        if (!url) continue;
        const idx = next.findIndex((r) => r.url === url);
        if (idx >= 0) next[idx] = { ...next[idx], enabled: true };
        else next.push({ key: nextKey(), url, enabled: true });
      }
      const csv = rowsToCsv(next);
      lastEmittedRef.current = csv;
      onChange(csv);
      return next;
    });
    setDraft('');
  };

  return (
    <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
      <Text size="sm" fw={500}>{label}</Text>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.length === 0 ? (
          <Text size="xs" c="dimmed">No URLs yet — add one below.</Text>
        ) : (
          rows.map((r) => (
            <Group key={r.key} align="center" gap={8}>
              <Checkbox checked={r.enabled} onChange={() => toggle(r.key)} />
              <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {r.url}
              </Text>
            </Group>
          ))
        )}
      </div>
      <TextInput
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addFromDraft();
          }
        }}
        placeholder={addPlaceholder}
        style={{ width: '100%', marginTop: 8 }}
      />
      {description && <Text size="xs" c="dimmed" mt={4}>{description}</Text>}
    </div>
  );
};
