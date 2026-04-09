'use client';

import React from 'react';
import { ExecutiveSummaryEditor } from './ExecutiveSummaryEditor';
import { ActionItemsEditor } from './ActionItemsEditor';
import { RiskMatrixEditor } from './RiskMatrixEditor';
import { MetricsEditor } from './MetricsEditor';
import { RichTextEditor } from './RichTextEditor';
import { TableEditor } from './TableEditor';
import { AgendaEditor } from './AgendaEditor';
import { AttendeesEditor } from './AttendeesEditor';
import { NextStepsEditor } from './NextStepsEditor';

export interface SectionEditorProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const EDITORS: Record<string, React.ComponentType<SectionEditorProps>> = {
  executive_summary: ExecutiveSummaryEditor,
  action_items: ActionItemsEditor,
  risk_matrix: RiskMatrixEditor,
  metrics_dashboard: MetricsEditor,
  rich_text: RichTextEditor,
  table: TableEditor,
  cab_agenda: AgendaEditor,
  cab_attendees: AttendeesEditor,
  cab_next_steps: NextStepsEditor,
  cab_decisions: NextStepsEditor, // Same structure as next steps
  sab_strategic_overview: ExecutiveSummaryEditor, // Same structure
};

export function SectionEditor({ typeKey, data, onChange }: { typeKey: string } & SectionEditorProps) {
  const Editor = EDITORS[typeKey];

  if (!Editor) {
    return (
      <div className="p-3 bg-zinc-800/50 rounded text-xs text-zinc-500">
        No structured editor for <span className="font-mono">{typeKey}</span> yet. Data is stored as JSON.
        <textarea
          value={JSON.stringify(data, null, 2)}
          onChange={(e) => { try { onChange(JSON.parse(e.target.value)); } catch {} }}
          className="mt-2 w-full h-24 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono text-zinc-300 focus:outline-none focus:border-teal-500"
        />
      </div>
    );
  }

  return <Editor data={data} onChange={onChange} />;
}
