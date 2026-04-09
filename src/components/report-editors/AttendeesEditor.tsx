'use client';

type Attendee = { name: string; role: string; company: string; present: boolean };
type Props = { data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void };

export function AttendeesEditor({ data, onChange }: Props) {
  const attendees = (data.attendees as Attendee[]) || [];

  const update = (next: Attendee[]) => onChange({ ...data, attendees: next });

  const editField = (idx: number, field: keyof Attendee, value: string | boolean) => {
    const next = [...attendees];
    next[idx] = { ...next[idx], [field]: value };
    update(next);
  };

  const addAttendee = () => update([...attendees, { name: '', role: '', company: '', present: false }]);
  const removeAttendee = (idx: number) => update(attendees.filter((_, i) => i !== idx));

  const thClass = 'px-3 py-2 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider';
  const tdClass = 'px-1 py-1';
  const inputClass = 'w-full px-2 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500';

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800">
            <tr>
              <th className={thClass}>Name</th>
              <th className={thClass}>Role</th>
              <th className={thClass}>Company</th>
              <th className={thClass + ' w-20 text-center'}>Present</th>
              <th className={thClass + ' w-10'}></th>
            </tr>
          </thead>
          <tbody className="bg-zinc-800/50 divide-y divide-zinc-700/50">
            {attendees.map((a, i) => (
              <tr key={i}>
                <td className={tdClass}><input value={a.name} onChange={(e) => editField(i, 'name', e.target.value)} className={inputClass} /></td>
                <td className={tdClass}><input value={a.role} onChange={(e) => editField(i, 'role', e.target.value)} className={inputClass} /></td>
                <td className={tdClass}><input value={a.company} onChange={(e) => editField(i, 'company', e.target.value)} className={inputClass} /></td>
                <td className={tdClass + ' text-center'}>
                  <input type="checkbox" checked={a.present} onChange={(e) => editField(i, 'present', e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-teal-500 focus:ring-teal-500 focus:ring-offset-0" />
                </td>
                <td className={tdClass}><button onClick={() => removeAttendee(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addAttendee} className="px-3 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded">+ Add Attendee</button>
    </div>
  );
}
