import { useEffect, useRef, useState } from 'react';

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
    <div className="mb-4">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <ul className="m-0 max-h-48 list-none space-y-1.5 overflow-y-auto rounded border border-border-soft bg-paper p-2 pl-2">
        {rows.length === 0 ? (
          <li className="px-1 py-2 text-xs italic text-ink-muted">No URLs yet — add one below.</li>
        ) : (
          rows.map((r) => (
            <li key={r.key} className="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-border-soft/40">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={() => toggle(r.key)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary"
              />
              <span
                className={`min-w-0 flex-1 break-all font-mono text-[11px] leading-snug ${
                  r.enabled ? 'text-ink' : 'text-ink-muted line-through'
                }`}
              >
                {r.url}
              </span>
            </li>
          ))
        )}
      </ul>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addFromDraft();
          }
        }}
        placeholder={addPlaceholder}
        className="mt-1.5 block w-full rounded border border-border bg-paper-elevated px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {description && <p className="m-0 mt-1 text-xs leading-snug text-ink-muted">{description}</p>}
    </div>
  );
};
