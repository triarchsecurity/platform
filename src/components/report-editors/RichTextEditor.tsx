'use client';

type Props = { data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void };

export function RichTextEditor({ data, onChange }: Props) {
  const htmlContent = (data.html_content as string) || '';

  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1">Content</label>
      <textarea
        value={htmlContent}
        onChange={(e) => onChange({ ...data, html_content: e.target.value })}
        rows={10}
        placeholder="Enter content..."
        className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 font-mono focus:outline-none focus:border-teal-500 resize-y"
      />
    </div>
  );
}
