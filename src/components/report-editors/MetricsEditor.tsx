'use client';

type Metric = { label: string; value: string; trend: string; target: string };
type Props = { data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void };

const TRENDS = ['up', 'down', 'flat'] as const;
const TREND_ICONS: Record<string, string> = { up: '\u2191', down: '\u2193', flat: '\u2192' };

export function MetricsEditor({ data, onChange }: Props) {
  const metrics = (data.metrics as Metric[]) || [];

  const update = (next: Metric[]) => onChange({ ...data, metrics: next });

  const editField = (idx: number, field: keyof Metric, value: string) => {
    const next = [...metrics];
    next[idx] = { ...next[idx], [field]: value };
    update(next);
  };

  const addMetric = () => update([...metrics, { label: '', value: '', trend: 'flat', target: '' }]);
  const removeMetric = (idx: number) => update(metrics.filter((_, i) => i !== idx));

  const inputClass = 'w-full px-2 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map((m, i) => (
          <div key={i} className="relative p-3 bg-zinc-800 border border-zinc-700 rounded-lg space-y-2">
            <button onClick={() => removeMetric(i)} className="absolute top-2 right-2 text-red-400 hover:text-red-300 text-xs">✕</button>
            <div>
              <label className="text-xs text-zinc-500">Label</label>
              <input value={m.label} onChange={(e) => editField(i, 'label', e.target.value)} className={inputClass} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-zinc-500">Value</label>
                <input value={m.value} onChange={(e) => editField(i, 'value', e.target.value)} className={inputClass} />
              </div>
              <div className="w-20">
                <label className="text-xs text-zinc-500">Trend</label>
                <select value={m.trend} onChange={(e) => editField(i, 'trend', e.target.value)} className={inputClass}>
                  {TRENDS.map((t) => <option key={t} value={t}>{TREND_ICONS[t]} {t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500">Target</label>
              <input value={m.target} onChange={(e) => editField(i, 'target', e.target.value)} className={inputClass} />
            </div>
          </div>
        ))}
      </div>
      <button onClick={addMetric} className="px-3 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded">+ Add Metric</button>
    </div>
  );
}
