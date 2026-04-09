'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { FileText, Plus, ChevronDown, ChevronRight, Trash2, Eye, ArrowUp, ArrowDown, X, Edit2 } from 'lucide-react';
import { SectionEditor } from '@/components/report-editors';

interface SectionType {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  dataSchema: Record<string, unknown>;
}

interface ReportSection {
  id: string;
  type_key: string;
  title: string;
  sort_order: number;
  data: Record<string, unknown>;
  config: Record<string, unknown>;
}

interface Report {
  id: string;
  project: string;
  title: string;
  reportType: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  sections: ReportSection[];
  createdBy: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-300',
  in_review: 'bg-amber-500/20 text-amber-400',
  published: 'bg-green-500/20 text-green-400',
  archived: 'bg-zinc-800 text-zinc-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  standard: 'Standard',
  cab: 'CAB',
  sab: 'SAB',
  financial: 'Financial',
  custom: 'Custom',
};

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [sectionTypes, setSectionTypes] = useState<SectionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [newReport, setNewReport] = useState({ project: 'triarch-dev', title: '', reportType: 'monthly_summary' });
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [reportsRes, typesRes] = await Promise.all([
      fetch('/api/platform/reports'),
      fetch('/api/platform/report-section-types'),
    ]);
    const reportsData = await reportsRes.json();
    const typesData = await typesRes.json();
    setReports(reportsData.reports);
    setSectionTypes(typesData.types);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function createReport() {
    if (!newReport.title) return;
    const res = await fetch('/api/platform/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReport),
    });
    const report = await res.json();
    setShowCreateForm(false);
    setNewReport({ project: 'triarch-dev', title: '', reportType: 'monthly_summary' });
    setEditingReport(report);
    await fetchData();
  }

  async function saveReport(report: Report) {
    await fetch(`/api/platform/reports/${report.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: report.sections, title: report.title, status: report.status }),
    });
    await fetchData();
  }

  async function deleteReport(id: string) {
    if (!confirm('Delete this report?')) return;
    await fetch(`/api/platform/reports/${id}`, { method: 'DELETE' });
    if (editingReport?.id === id) setEditingReport(null);
    await fetchData();
  }

  function addSection(typeKey: string) {
    if (!editingReport) return;
    const sType = sectionTypes.find((t) => t.key === typeKey);
    if (!sType) return;

    const newSection: ReportSection = {
      id: crypto.randomUUID(),
      type_key: typeKey,
      title: sType.name,
      sort_order: editingReport.sections.length,
      data: {},
      config: {},
    };

    const updated = { ...editingReport, sections: [...editingReport.sections, newSection] };
    setEditingReport(updated);
    setShowSectionPicker(false);
    saveReport(updated);
  }

  function updateSectionData(sectionId: string, data: Record<string, unknown>) {
    if (!editingReport) return;
    const updated = {
      ...editingReport,
      sections: editingReport.sections.map((s) =>
        s.id === sectionId ? { ...s, data } : s
      ),
    };
    setEditingReport(updated);
    saveReport(updated);
  }

  function removeSection(sectionId: string) {
    if (!editingReport) return;
    const updated = {
      ...editingReport,
      sections: editingReport.sections
        .filter((s) => s.id !== sectionId)
        .map((s, i) => ({ ...s, sort_order: i })),
    };
    setEditingReport(updated);
    saveReport(updated);
  }

  function moveSectionUpDown(index: number, direction: -1 | 1) {
    if (!editingReport) return;
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= editingReport.sections.length) return;

    const sections = [...editingReport.sections];
    [sections[index], sections[swapIdx]] = [sections[swapIdx], sections[index]];
    const reordered = sections.map((s, i) => ({ ...s, sort_order: i }));
    const updated = { ...editingReport, sections: reordered };
    setEditingReport(updated);
    saveReport(updated);
  }

  // ── Report Editor View ──
  if (editingReport) {
    const grouped = sectionTypes.reduce<Record<string, SectionType[]>>((acc, t) => {
      (acc[t.category] = acc[t.category] ?? []).push(t);
      return acc;
    }, {});

    return (
      <div className="p-8 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => setEditingReport(null)} className="text-xs text-zinc-500 hover:text-zinc-300 mb-2 block">
              &larr; Back to reports
            </button>
            <h1 className="text-2xl font-bold text-white">{editingReport.title}</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{editingReport.reportType} &middot; {editingReport.sections.length} sections</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={editingReport.status}
              onChange={(e) => {
                const updated = { ...editingReport, status: e.target.value };
                setEditingReport(updated);
                saveReport(updated);
              }}
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
            >
              <option value="draft">Draft</option>
              <option value="in_review">In Review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            <button onClick={() => setShowSectionPicker(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500">
              <Plus size={14} /> Add Section
            </button>
          </div>
        </div>

        {/* Sections */}
        {editingReport.sections.length === 0 ? (
          <div className="p-12 text-center rounded-lg bg-zinc-900 border border-dashed border-zinc-700">
            <FileText size={32} className="mx-auto text-zinc-600 mb-3" />
            <p className="text-zinc-500">No sections yet</p>
            <button onClick={() => setShowSectionPicker(true)}
              className="mt-3 text-sm text-teal-400 hover:text-teal-300">Add your first section</button>
          </div>
        ) : (
          <div className="space-y-2">
            {editingReport.sections
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((section, idx) => {
                const sType = sectionTypes.find((t) => t.key === section.type_key);
                return (
                  <div key={section.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveSectionUpDown(idx, -1)} className="text-zinc-600 hover:text-zinc-300" disabled={idx === 0}>
                          <ArrowUp size={12} />
                        </button>
                        <button onClick={() => moveSectionUpDown(idx, 1)} className="text-zinc-600 hover:text-zinc-300"
                          disabled={idx === editingReport.sections.length - 1}>
                          <ArrowDown size={12} />
                        </button>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white text-sm">{section.title}</span>
                          <span className="text-[10px] text-zinc-600 font-mono">{section.type_key}</span>
                          {sType && (
                            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                              {CATEGORY_LABELS[sType.category] ?? sType.category}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {Object.keys(section.data).length > 0
                            ? `${Object.keys(section.data).length} field(s) populated`
                            : 'Empty — click to edit'}
                        </p>
                      </div>
                      <button onClick={() => setEditingSectionId(editingSectionId === section.id ? null : section.id)}
                        className={`p-1 transition-colors ${editingSectionId === section.id ? 'text-teal-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => removeSection(section.id)} className="text-zinc-600 hover:text-red-400 p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {editingSectionId === section.id && (
                      <div className="mt-3 pt-3 border-t border-zinc-800">
                        <SectionEditor
                          typeKey={section.type_key}
                          data={section.data}
                          onChange={(data) => updateSectionData(section.id, data)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Section Picker Modal */}
        {showSectionPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Add Section</h3>
                <button onClick={() => setShowSectionPicker(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X size={18} />
                </button>
              </div>
              {Object.entries(grouped).map(([category, types]) => (
                <div key={category} className="mb-4">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    {CATEGORY_LABELS[category] ?? category}
                  </h4>
                  <div className="space-y-1">
                    {types.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => addSection(t.key)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-zinc-800 transition-colors"
                      >
                        <FileText size={14} className="text-zinc-500" />
                        <div>
                          <span className="text-sm text-zinc-200">{t.name}</span>
                          {t.description && <p className="text-xs text-zinc-500 mt-0.5">{t.description}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Reports List View ──
  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText size={24} className="text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Reports</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{reports.length} report{reports.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500">
          <Plus size={14} /> New Report
        </button>
      </div>

      {showCreateForm && (
        <div className="mb-6 p-5 rounded-lg bg-zinc-900 border border-zinc-700">
          <h3 className="text-sm font-semibold text-white mb-4">New Report</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Title</label>
              <input value={newReport.title} onChange={(e) => setNewReport({ ...newReport, title: e.target.value })}
                placeholder="April 2026 Status Report"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Report Type</label>
              <select value={newReport.reportType} onChange={(e) => setNewReport({ ...newReport, reportType: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500">
                <option value="monthly_summary">Monthly Summary</option>
                <option value="cab_report">CAB Report</option>
                <option value="sab_report">SAB Report</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowCreateForm(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
            <button onClick={createReport} disabled={!newReport.title}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50">Create</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-zinc-800/50 rounded-lg animate-pulse" />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
          <FileText size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-500">No reports yet</p>
          <p className="text-xs text-zinc-600 mt-1">Create a report and add sections from the section type library.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <div key={report.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setEditingReport(report)} className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm">{report.title}</span>
                    <span className="text-[10px] text-zinc-600">{report.reportType}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {(report.sections as ReportSection[]).length} section{(report.sections as ReportSection[]).length !== 1 ? 's' : ''} &middot; {new Date(report.createdAt).toLocaleDateString()}
                  </p>
                </button>
                <span className={`px-2 py-0.5 rounded text-[10px] ${STATUS_COLORS[report.status] ?? 'bg-zinc-700 text-zinc-400'}`}>
                  {report.status.replace('_', ' ')}
                </span>
                <button onClick={() => setEditingReport(report)} className="text-zinc-500 hover:text-zinc-300 p-1">
                  <Eye size={14} />
                </button>
                <button onClick={() => deleteReport(report.id)} className="text-zinc-600 hover:text-red-400 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
