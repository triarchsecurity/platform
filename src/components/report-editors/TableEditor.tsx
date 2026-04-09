'use client';

import { useState } from 'react';

type Props = { data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void };

export function TableEditor({ data, onChange }: Props) {
  const columns = (data.columns as string[]) || [];
  const rows = (data.rows as string[][]) || [];
  const [newCol, setNewCol] = useState('');

  const update = (patch: Partial<Record<string, unknown>>) => onChange({ ...data, ...patch });

  const editColumn = (idx: number, value: string) => {
    const next = [...columns];
    next[idx] = value;
    update({ columns: next });
  };

  const addColumn = () => {
    if (!newCol.trim()) return;
    update({ columns: [...columns, newCol.trim()], rows: rows.map((r) => [...r, '']) });
    setNewCol('');
  };

  const removeColumn = (idx: number) => {
    update({ columns: columns.filter((_, i) => i !== idx), rows: rows.map((r) => r.filter((_, i) => i !== idx)) });
  };

  const addRow = () => update({ rows: [...rows, columns.map(() => '')] });
  const removeRow = (idx: number) => update({ rows: rows.filter((_, i) => i !== idx) });

  const editCell = (rowIdx: number, colIdx: number, value: string) => {
    const next = rows.map((r) => [...r]);
    next[rowIdx][colIdx] = value;
    update({ rows: next });
  };

  const inputClass = 'w-full px-2 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500';
  const thClass = 'px-1 py-1';

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className={thClass}>
                  <div className="flex items-center gap-1">
                    <input value={col} onChange={(e) => editColumn(i, e.target.value)} className={inputClass + ' font-medium'} />
                    <button onClick={() => removeColumn(i)} className="text-red-400 hover:text-red-300 text-xs shrink-0">✕</button>
                  </div>
                </th>
              ))}
              <th className={thClass + ' w-10'}></th>
            </tr>
          </thead>
          <tbody className="bg-zinc-800/50 divide-y divide-zinc-700/50">
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className={thClass}>
                    <input value={cell} onChange={(e) => editCell(ri, ci, e.target.value)} className={inputClass} />
                  </td>
                ))}
                <td className={thClass}><button onClick={() => removeRow(ri)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button onClick={addRow} className="px-3 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded">+ Add Row</button>
        <div className="flex gap-1">
          <input value={newCol} onChange={(e) => setNewCol(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addColumn()}
            placeholder="Column name..." className="px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500" />
          <button onClick={addColumn} className="px-3 py-1 text-xs bg-zinc-600 hover:bg-zinc-500 text-white rounded">+ Column</button>
        </div>
      </div>
    </div>
  );
}
