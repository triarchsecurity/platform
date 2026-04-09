'use client';

type ActionItem = { text: string; owner: string; due_date: string; status: string };
type Props = { data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void };

const STATUSES = ['pending', 'in_progress', 'done', 'overdue'] as const;

export function ActionItemsEditor({ data, onChange }: Props) {
  const items = (data.items as ActionItem[]) || [];

  const update = (next: ActionItem[]) => onChange({ ...data, items: next });

  const editField = (idx: number, field: keyof ActionItem, value: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    update(next);
  };

  const addRow = () => update([...items, { text: '', owner: '', due_date: '', status: 'pending' }]);
  const removeRow = (idx: number) => update(items.filter((_, i) => i !== idx));

  const thClass = 'px-3 py-2 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider';
  const tdClass = 'px-1 py-1';
  const inputClass = 'w-full px-2 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500';

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800">
            <tr>
              <th className={thClass}>Action</th>
              <th className={thClass}>Owner</th>
              <th className={thClass}>Due Date</th>
              <th className={thClass}>Status</th>
              <th className={thClass + ' w-10'}></th>
            </tr>
          </thead>
          <tbody className="bg-zinc-800/50 divide-y divide-zinc-700/50">
            {items.map((item, i) => (
              <tr key={i}>
                <td className={tdClass}><input value={item.text} onChange={(e) => editField(i, 'text', e.target.value)} className={inputClass} /></td>
                <td className={tdClass}><input value={item.owner} onChange={(e) => editField(i, 'owner', e.target.value)} className={inputClass} /></td>
                <td className={tdClass}><input type="date" value={item.due_date} onChange={(e) => editField(i, 'due_date', e.target.value)} className={inputClass} /></td>
                <td className={tdClass}>
                  <select value={item.status} onChange={(e) => editField(i, 'status', e.target.value)} className={inputClass}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </td>
                <td className={tdClass}><button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} className="px-3 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded">+ Add Row</button>
    </div>
  );
}
