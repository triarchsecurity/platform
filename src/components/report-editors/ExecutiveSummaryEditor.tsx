'use client';

import { useState } from 'react';

type Props = { data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void };

export function ExecutiveSummaryEditor({ data, onChange }: Props) {
  const summaryText = (data.summary_text as string) || '';
  const highlights = (data.highlights as string[]) || [];
  const risks = (data.risks as string[]) || [];
  const [newHighlight, setNewHighlight] = useState('');
  const [newRisk, setNewRisk] = useState('');

  const update = (patch: Partial<Record<string, unknown>>) => onChange({ ...data, ...patch });

  const addItem = (key: string, list: string[], value: string, clear: () => void) => {
    if (!value.trim()) return;
    update({ [key]: [...list, value.trim()] });
    clear();
  };

  const removeItem = (key: string, list: string[], idx: number) => {
    update({ [key]: list.filter((_, i) => i !== idx) });
  };

  const editItem = (key: string, list: string[], idx: number, value: string) => {
    const next = [...list];
    next[idx] = value;
    update({ [key]: next });
  };

  const renderList = (label: string, key: string, list: string[], newVal: string, setNewVal: (v: string) => void) => (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      <ul className="space-y-1 mb-2">
        {list.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="text-teal-400 text-xs">&#8226;</span>
            <input
              value={item}
              onChange={(e) => editItem(key, list, i, e.target.value)}
              className="flex-1 px-2 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500"
            />
            <button onClick={() => removeItem(key, list, i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem(key, list, newVal, () => setNewVal(''))}
          placeholder={`Add ${label.toLowerCase().slice(0, -1)}...`}
          className="flex-1 px-2 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500"
        />
        <button onClick={() => addItem(key, list, newVal, () => setNewVal(''))} className="px-3 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded">Add</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">Summary</label>
        <textarea
          value={summaryText}
          onChange={(e) => update({ summary_text: e.target.value })}
          rows={4}
          className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500 resize-y"
        />
      </div>
      {renderList('Highlights', 'highlights', highlights, newHighlight, setNewHighlight)}
      {renderList('Risks', 'risks', risks, newRisk, setNewRisk)}
    </div>
  );
}
