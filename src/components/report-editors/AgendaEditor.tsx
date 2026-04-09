'use client';

type Topic = { title: string; duration_min: number; presenter: string; notes: string };
type Props = { data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void };

export function AgendaEditor({ data, onChange }: Props) {
  const topics = (data.topics as Topic[]) || [];

  const update = (next: Topic[]) => onChange({ ...data, topics: next });

  const editField = (idx: number, field: keyof Topic, value: string | number) => {
    const next = [...topics];
    next[idx] = { ...next[idx], [field]: value };
    update(next);
  };

  const addTopic = () => update([...topics, { title: '', duration_min: 5, presenter: '', notes: '' }]);
  const removeTopic = (idx: number) => update(topics.filter((_, i) => i !== idx));

  const inputClass = 'w-full px-2 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500';

  return (
    <div className="space-y-3">
      {topics.map((topic, i) => (
        <div key={i} className="relative p-3 bg-zinc-800 border border-zinc-700 rounded-lg space-y-2">
          <button onClick={() => removeTopic(i)} className="absolute top-2 right-2 text-red-400 hover:text-red-300 text-xs">✕</button>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-zinc-500">Title</label>
              <input value={topic.title} onChange={(e) => editField(i, 'title', e.target.value)} className={inputClass} />
            </div>
            <div className="w-24">
              <label className="text-xs text-zinc-500">Duration (min)</label>
              <input type="number" min={1} value={topic.duration_min} onChange={(e) => editField(i, 'duration_min', parseInt(e.target.value) || 0)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500">Presenter</label>
            <input value={topic.presenter} onChange={(e) => editField(i, 'presenter', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Notes</label>
            <textarea value={topic.notes} onChange={(e) => editField(i, 'notes', e.target.value)} rows={2} className={inputClass + ' resize-y'} />
          </div>
        </div>
      ))}
      <button onClick={addTopic} className="px-3 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded">+ Add Topic</button>
    </div>
  );
}
