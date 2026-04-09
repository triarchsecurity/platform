'use client';

type Step = { action: string; owner: string; timeline: string };
type Props = { data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void };

export function NextStepsEditor({ data, onChange }: Props) {
  const steps = (data.steps as Step[]) || [];

  const update = (next: Step[]) => onChange({ ...data, steps: next });

  const editField = (idx: number, field: keyof Step, value: string) => {
    const next = [...steps];
    next[idx] = { ...next[idx], [field]: value };
    update(next);
  };

  const addStep = () => update([...steps, { action: '', owner: '', timeline: '' }]);
  const removeStep = (idx: number) => update(steps.filter((_, i) => i !== idx));

  const inputClass = 'w-full px-2 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500';

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={i} className="relative flex gap-2 items-start p-3 bg-zinc-800 border border-zinc-700 rounded-lg">
          <span className="text-teal-400 text-sm font-mono mt-1 shrink-0">{i + 1}.</span>
          <div className="flex-1 space-y-2">
            <div>
              <label className="text-xs text-zinc-500">Action</label>
              <input value={step.action} onChange={(e) => editField(i, 'action', e.target.value)} className={inputClass} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-zinc-500">Owner</label>
                <input value={step.owner} onChange={(e) => editField(i, 'owner', e.target.value)} className={inputClass} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-zinc-500">Timeline</label>
                <input value={step.timeline} onChange={(e) => editField(i, 'timeline', e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>
          <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-300 text-xs mt-1 shrink-0">✕</button>
        </div>
      ))}
      <button onClick={addStep} className="px-3 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded">+ Add Step</button>
    </div>
  );
}
