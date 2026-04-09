'use client';

type Risk = { name: string; likelihood: string; impact: string; mitigation: string; status: string };
type Props = { data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void };

const LEVELS = ['low', 'medium', 'high', 'critical'] as const;
const RISK_STATUSES = ['open', 'mitigated', 'accepted'] as const;

export function RiskMatrixEditor({ data, onChange }: Props) {
  const risks = (data.risks as Risk[]) || [];

  const update = (next: Risk[]) => onChange({ ...data, risks: next });

  const editField = (idx: number, field: keyof Risk, value: string) => {
    const next = [...risks];
    next[idx] = { ...next[idx], [field]: value };
    update(next);
  };

  const addRow = () => update([...risks, { name: '', likelihood: 'low', impact: 'low', mitigation: '', status: 'open' }]);
  const removeRow = (idx: number) => update(risks.filter((_, i) => i !== idx));

  const thClass = 'px-3 py-2 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider';
  const tdClass = 'px-1 py-1';
  const inputClass = 'w-full px-2 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500';

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800">
            <tr>
              <th className={thClass}>Risk</th>
              <th className={thClass}>Likelihood</th>
              <th className={thClass}>Impact</th>
              <th className={thClass}>Mitigation</th>
              <th className={thClass}>Status</th>
              <th className={thClass + ' w-10'}></th>
            </tr>
          </thead>
          <tbody className="bg-zinc-800/50 divide-y divide-zinc-700/50">
            {risks.map((risk, i) => (
              <tr key={i}>
                <td className={tdClass}><input value={risk.name} onChange={(e) => editField(i, 'name', e.target.value)} className={inputClass} /></td>
                <td className={tdClass}>
                  <select value={risk.likelihood} onChange={(e) => editField(i, 'likelihood', e.target.value)} className={inputClass}>
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </td>
                <td className={tdClass}>
                  <select value={risk.impact} onChange={(e) => editField(i, 'impact', e.target.value)} className={inputClass}>
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </td>
                <td className={tdClass}><input value={risk.mitigation} onChange={(e) => editField(i, 'mitigation', e.target.value)} className={inputClass} /></td>
                <td className={tdClass}>
                  <select value={risk.status} onChange={(e) => editField(i, 'status', e.target.value)} className={inputClass}>
                    {RISK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className={tdClass}><button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} className="px-3 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded">+ Add Risk</button>
    </div>
  );
}
