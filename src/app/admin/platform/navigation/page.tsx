'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Save,
  X,
  FileText,
  Layers,
} from 'lucide-react';

interface SubpageData {
  id: string;
  key: string;
  label: string;
  path: string;
  sortOrder: number;
  isActive: boolean;
  minRole: string;
}

interface PageData {
  id: string;
  sectionId: string;
  key: string;
  label: string;
  icon: string | null;
  path: string;
  sortOrder: number;
  isActive: boolean;
  minRole: string;
  badgeSource: string | null;
  subpages: SubpageData[];
}

interface SectionData {
  id: string;
  project: string;
  key: string;
  label: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  minRole: string;
  pages: PageData[];
}

const ROLE_OPTIONS = ['user', 'admin', 'super_admin'];
const ICON_OPTIONS = ['layout-dashboard', 'settings', 'bug', 'file-text', 'shield', 'activity', 'briefcase'];

export default function NavigationEditorPage() {
  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewRole, setPreviewRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingTo, setAddingTo] = useState<{ type: 'section' | 'page' | 'subpage'; parentId?: string } | null>(null);
  const [newItem, setNewItem] = useState({ key: '', label: '', icon: '', path: '', minRole: 'admin' });

  const fetchNav = useCallback(async () => {
    const res = await fetch('/api/platform/navigation/admin');
    const data = await res.json();
    setSections(data.sections);
    setLoading(false);
  }, []);

  useEffect(() => { fetchNav(); }, [fetchNav]);

  async function updateSection(id: string, updates: Partial<SectionData>) {
    setSaving(true);
    await fetch(`/api/platform/navigation/sections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await fetchNav();
    setSaving(false);
    setEditingId(null);
  }

  async function updatePage(id: string, updates: Partial<PageData>) {
    setSaving(true);
    await fetch(`/api/platform/navigation/pages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await fetchNav();
    setSaving(false);
    setEditingId(null);
  }

  async function updateSubpage(id: string, updates: Partial<SubpageData>) {
    setSaving(true);
    await fetch(`/api/platform/navigation/subpages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await fetchNav();
    setSaving(false);
    setEditingId(null);
  }

  async function deleteItem(type: 'sections' | 'pages' | 'subpages', id: string) {
    if (!confirm('Delete this item? This will also delete all children.')) return;
    setSaving(true);
    await fetch(`/api/platform/navigation/${type}/${id}`, { method: 'DELETE' });
    await fetchNav();
    setSaving(false);
  }

  async function moveItem(type: 'section' | 'page' | 'subpage', items: { id: string; sortOrder: number }[]) {
    await fetch('/api/platform/navigation/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, items }),
    });
    await fetchNav();
  }

  async function addItem() {
    if (!addingTo || !newItem.key || !newItem.label) return;
    setSaving(true);

    const endpoint = addingTo.type === 'section'
      ? '/api/platform/navigation/sections'
      : addingTo.type === 'page'
        ? '/api/platform/navigation/pages'
        : '/api/platform/navigation/subpages';

    const body: Record<string, unknown> = {
      key: newItem.key,
      label: newItem.label,
      minRole: newItem.minRole,
    };

    if (addingTo.type === 'section') {
      body.icon = newItem.icon || null;
    } else if (addingTo.type === 'page') {
      body.sectionId = addingTo.parentId;
      body.icon = newItem.icon || null;
      body.path = newItem.path;
    } else {
      body.pageId = addingTo.parentId;
      body.path = newItem.path;
    }

    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setAddingTo(null);
    setNewItem({ key: '', label: '', icon: '', path: '', minRole: 'admin' });
    await fetchNav();
    setSaving(false);
  }

  function moveSectionUpDown(index: number, direction: -1 | 1) {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    const items = [
      { id: sections[index].id, sortOrder: sections[swapIdx].sortOrder },
      { id: sections[swapIdx].id, sortOrder: sections[index].sortOrder },
    ];
    moveItem('section', items);
  }

  function movePageUpDown(sectionId: string, pageIndex: number, direction: -1 | 1) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const swapIdx = pageIndex + direction;
    if (swapIdx < 0 || swapIdx >= section.pages.length) return;
    const items = [
      { id: section.pages[pageIndex].id, sortOrder: section.pages[swapIdx].sortOrder },
      { id: section.pages[swapIdx].id, sortOrder: section.pages[pageIndex].sortOrder },
    ];
    moveItem('page', items);
  }

  // Role preview filter
  const ROLE_ORDER: Record<string, number> = { super_admin: 2, admin: 1, user: 0 };
  const filteredSections = previewRole
    ? sections.filter((s) => s.isActive && (ROLE_ORDER[previewRole] ?? 0) >= (ROLE_ORDER[s.minRole] ?? 0))
        .map((s) => ({
          ...s,
          pages: s.pages.filter((p) => p.isActive && (ROLE_ORDER[previewRole] ?? 0) >= (ROLE_ORDER[p.minRole] ?? 0)),
        }))
    : sections;

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white">Navigation Editor</h1>
        <div className="mt-8 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-zinc-800/50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Navigation Editor</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage DB-driven menu structure</p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-teal-400 animate-pulse">Saving...</span>}

          {/* Role preview */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1">
            <span className="text-xs text-zinc-500 mr-1">Preview:</span>
            {['user', 'admin', 'super_admin'].map((role) => (
              <button
                key={role}
                onClick={() => setPreviewRole(previewRole === role ? null : role)}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  previewRole === role
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {role.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {previewRole && (
        <div className="mb-4 p-3 rounded-md bg-teal-500/10 border border-teal-500/20 text-sm text-teal-400">
          Previewing as <strong>{previewRole.replace('_', ' ')}</strong> — showing only visible items.
          <button onClick={() => setPreviewRole(null)} className="ml-2 underline">Exit preview</button>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-2">
        {filteredSections.map((section, sIdx) => (
          <div key={section.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            {/* Section header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900">
              {!previewRole && (
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveSectionUpDown(sIdx, -1)} className="text-zinc-600 hover:text-zinc-300" disabled={sIdx === 0}>
                    <ArrowUp size={12} />
                  </button>
                  <button onClick={() => moveSectionUpDown(sIdx, 1)} className="text-zinc-600 hover:text-zinc-300" disabled={sIdx === sections.length - 1}>
                    <ArrowDown size={12} />
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  const next = new Set(expandedSections);
                  next.has(section.id) ? next.delete(section.id) : next.add(section.id);
                  setExpandedSections(next);
                }}
                className="text-zinc-400"
              >
                {expandedSections.has(section.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              <Layers size={14} className="text-zinc-500" />

              {editingId === section.id ? (
                <EditableFields
                  item={section}
                  type="section"
                  onSave={(updates) => updateSection(section.id, updates)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <span className="font-medium text-white flex-1">{section.label}</span>
                  <span className="text-[10px] text-zinc-600 font-mono">{section.key}</span>
                  <RoleBadge role={section.minRole} />
                  <ActiveBadge active={section.isActive} onToggle={previewRole ? undefined : () => updateSection(section.id, { isActive: !section.isActive })} />
                  {!previewRole && (
                    <>
                      <button onClick={() => setEditingId(section.id)} className="text-zinc-500 hover:text-zinc-300 p-1"><GripVertical size={14} /></button>
                      <button onClick={() => deleteItem('sections', section.id)} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Pages */}
            {expandedSections.has(section.id) && (
              <div className="border-t border-zinc-800">
                {section.pages.map((page, pIdx) => (
                  <div key={page.id} className="border-b border-zinc-800/50 last:border-b-0">
                    <div className="flex items-center gap-2 pl-10 pr-4 py-2.5">
                      {!previewRole && (
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => movePageUpDown(section.id, pIdx, -1)} className="text-zinc-600 hover:text-zinc-300" disabled={pIdx === 0}>
                            <ArrowUp size={10} />
                          </button>
                          <button onClick={() => movePageUpDown(section.id, pIdx, 1)} className="text-zinc-600 hover:text-zinc-300" disabled={pIdx === section.pages.length - 1}>
                            <ArrowDown size={10} />
                          </button>
                        </div>
                      )}

                      {page.subpages.length > 0 && (
                        <button
                          onClick={() => {
                            const next = new Set(expandedPages);
                            next.has(page.id) ? next.delete(page.id) : next.add(page.id);
                            setExpandedPages(next);
                          }}
                          className="text-zinc-500"
                        >
                          {expandedPages.has(page.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}

                      <FileText size={13} className="text-zinc-500" />

                      {editingId === page.id ? (
                        <EditableFields
                          item={page}
                          type="page"
                          onSave={(updates) => updatePage(page.id, updates)}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <>
                          <span className="text-sm text-zinc-200 flex-1">{page.label}</span>
                          <span className="text-[10px] text-zinc-600 font-mono">{page.path}</span>
                          <RoleBadge role={page.minRole} />
                          <ActiveBadge active={page.isActive} onToggle={previewRole ? undefined : () => updatePage(page.id, { isActive: !page.isActive })} />
                          {!previewRole && (
                            <>
                              <button onClick={() => setEditingId(page.id)} className="text-zinc-500 hover:text-zinc-300 p-1"><GripVertical size={14} /></button>
                              <button onClick={() => deleteItem('pages', page.id)} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {/* Subpages */}
                    {expandedPages.has(page.id) && page.subpages.map((sp) => (
                      <div key={sp.id} className="flex items-center gap-2 pl-20 pr-4 py-2 text-xs">
                        <span className="text-zinc-400 flex-1">{sp.label}</span>
                        <span className="text-[10px] text-zinc-600 font-mono">{sp.path}</span>
                        <RoleBadge role={sp.minRole} />
                        <ActiveBadge active={sp.isActive} onToggle={previewRole ? undefined : () => updateSubpage(sp.id, { isActive: !sp.isActive })} />
                        {!previewRole && (
                          <button onClick={() => deleteItem('subpages', sp.id)} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                        )}
                      </div>
                    ))}

                    {/* Add subpage */}
                    {expandedPages.has(page.id) && !previewRole && (
                      <div className="pl-20 pr-4 py-1">
                        <button
                          onClick={() => setAddingTo({ type: 'subpage', parentId: page.id })}
                          className="text-xs text-zinc-600 hover:text-teal-400 flex items-center gap-1"
                        >
                          <Plus size={12} /> Add subpage
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add page */}
                {!previewRole && (
                  <div className="pl-10 pr-4 py-2 border-t border-zinc-800/50">
                    <button
                      onClick={() => setAddingTo({ type: 'page', parentId: section.id })}
                      className="text-xs text-zinc-600 hover:text-teal-400 flex items-center gap-1"
                    >
                      <Plus size={12} /> Add page
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add section */}
      {!previewRole && (
        <div className="mt-4">
          <button
            onClick={() => setAddingTo({ type: 'section' })}
            className="text-sm text-zinc-500 hover:text-teal-400 flex items-center gap-1.5 px-4 py-2 rounded-lg border border-dashed border-zinc-700 hover:border-teal-500/40 w-full justify-center transition-colors"
          >
            <Plus size={14} /> Add section
          </button>
        </div>
      )}

      {/* Add item modal */}
      {addingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">
              Add {addingTo.type}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Key (unique identifier)</label>
                <input
                  value={newItem.key}
                  onChange={(e) => setNewItem({ ...newItem, key: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
                  placeholder="e.g., my-section"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Label</label>
                <input
                  value={newItem.label}
                  onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
                  placeholder="e.g., My Section"
                />
              </div>
              {(addingTo.type === 'section' || addingTo.type === 'page') && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Icon</label>
                  <select
                    value={newItem.icon}
                    onChange={(e) => setNewItem({ ...newItem, icon: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="">None</option>
                    {ICON_OPTIONS.map((icon) => (
                      <option key={icon} value={icon}>{icon}</option>
                    ))}
                  </select>
                </div>
              )}
              {(addingTo.type === 'page' || addingTo.type === 'subpage') && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Path</label>
                  <input
                    value={newItem.path}
                    onChange={(e) => setNewItem({ ...newItem, path: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
                    placeholder="e.g., /admin/my-page"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Minimum Role</label>
                <select
                  value={newItem.minRole}
                  onChange={(e) => setNewItem({ ...newItem, minRole: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{role.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setAddingTo(null); setNewItem({ key: '', label: '', icon: '', path: '', minRole: 'admin' }); }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={addItem}
                disabled={!newItem.key || !newItem.label}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add {addingTo.type}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline editing component ──────────────────────────────────

function EditableFields({
  item,
  type,
  onSave,
  onCancel,
}: {
  item: { label: string; key: string; icon?: string | null; path?: string; minRole: string };
  type: 'section' | 'page' | 'subpage';
  onSave: (updates: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [icon, setIcon] = useState(item.icon ?? '');
  const [path, setPath] = useState((item as { path?: string }).path ?? '');
  const [minRole, setMinRole] = useState(item.minRole);

  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-sm text-zinc-200 w-32 focus:outline-none focus:border-teal-500"
        autoFocus
      />
      {type !== 'subpage' && (
        <select
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          className="px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-300 focus:outline-none focus:border-teal-500"
        >
          <option value="">No icon</option>
          {ICON_OPTIONS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      )}
      {type !== 'section' && (
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-300 w-40 focus:outline-none focus:border-teal-500"
          placeholder="/path"
        />
      )}
      <select
        value={minRole}
        onChange={(e) => setMinRole(e.target.value)}
        className="px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-300 focus:outline-none focus:border-teal-500"
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>{r.replace('_', ' ')}</option>
        ))}
      </select>
      <button
        onClick={() => onSave({ label, icon: icon || null, ...(type !== 'section' && { path }), minRole })}
        className="text-teal-400 hover:text-teal-300 p-1"
      >
        <Save size={14} />
      </button>
      <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 p-1">
        <X size={14} />
      </button>
    </div>
  );
}

// ── Badge components ──────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    user: 'bg-green-500/10 text-green-400 border-green-500/20',
    admin: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    super_admin: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${colors[role] ?? 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
      {role.replace('_', ' ')}
    </span>
  );
}

function ActiveBadge({ active, onToggle }: { active: boolean; onToggle?: () => void }) {
  const icon = active ? <Eye size={12} /> : <EyeOff size={12} />;
  return (
    <button
      onClick={onToggle}
      disabled={!onToggle}
      className={`p-1 rounded transition-colors ${
        active ? 'text-green-500 hover:text-green-400' : 'text-zinc-600 hover:text-zinc-400'
      } ${!onToggle ? 'cursor-default' : ''}`}
      title={active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
    >
      {icon}
    </button>
  );
}
