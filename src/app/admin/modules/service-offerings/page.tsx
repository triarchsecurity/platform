'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Briefcase, Plus, ChevronDown, ChevronRight, Globe, Edit2, Trash2, X } from 'lucide-react';

interface ServiceOffering {
  id: string;
  key: string;
  name: string;
  shortDescription: string | null;
  category: string;
  status: string;
  pricingModel: string;
  durationMonths: number | null;
  websiteVisible: boolean;
  componentsList: { id: string; name: string; componentType: string; frequency: string | null }[];
  milestonesList: { id: string; name: string; milestoneType: string; monthOffset: number }[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-300',
  active: 'bg-green-500/20 text-green-400',
  deprecated: 'bg-amber-500/20 text-amber-400',
  archived: 'bg-zinc-800 text-zinc-500',
};

const CATEGORY_COLORS: Record<string, string> = {
  advisory: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  assessment: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  managed: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  consulting: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export default function ServiceOfferingsPage() {
  const [offerings, setOfferings] = useState<ServiceOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newOffering, setNewOffering] = useState({
    key: '', name: '', shortDescription: '', category: 'advisory', pricingModel: 'custom', durationMonths: 12,
  });

  const fetchOfferings = useCallback(async () => {
    const res = await fetch('/api/platform/service-offerings');
    const data = await res.json();
    setOfferings(data.offerings);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOfferings(); }, [fetchOfferings]);

  async function createOffering() {
    if (!newOffering.key || !newOffering.name) return;
    await fetch('/api/platform/service-offerings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOffering),
    });
    setShowAddForm(false);
    setNewOffering({ key: '', name: '', shortDescription: '', category: 'advisory', pricingModel: 'custom', durationMonths: 12 });
    await fetchOfferings();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/platform/service-offerings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await fetchOfferings();
  }

  async function toggleWebsite(id: string, current: boolean) {
    await fetch(`/api/platform/service-offerings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ websiteVisible: !current }),
    });
    await fetchOfferings();
  }

  async function deleteOffering(id: string) {
    if (!confirm('Delete this service offering? This cannot be undone.')) return;
    await fetch(`/api/platform/service-offerings/${id}`, { method: 'DELETE' });
    await fetchOfferings();
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Briefcase size={24} className="text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Service Offerings</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{offerings.length} offering{offerings.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500">
          <Plus size={14} /> New Offering
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="mb-6 p-5 rounded-lg bg-zinc-900 border border-zinc-700">
          <h3 className="text-sm font-semibold text-white mb-4">New Service Offering</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Key</label>
              <input value={newOffering.key} onChange={(e) => setNewOffering({ ...newOffering, key: e.target.value })}
                placeholder="e.g., cab" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Name</label>
              <input value={newOffering.name} onChange={(e) => setNewOffering({ ...newOffering, name: e.target.value })}
                placeholder="Customer Advisory Board" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Category</label>
              <select value={newOffering.category} onChange={(e) => setNewOffering({ ...newOffering, category: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500">
                <option value="advisory">Advisory</option>
                <option value="assessment">Assessment</option>
                <option value="managed">Managed</option>
                <option value="consulting">Consulting</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Pricing Model</label>
              <select value={newOffering.pricingModel} onChange={(e) => setNewOffering({ ...newOffering, pricingModel: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500">
                <option value="fixed">Fixed</option>
                <option value="monthly">Monthly</option>
                <option value="hourly">Hourly</option>
                <option value="milestone">Milestone</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-zinc-500 mb-1">Short Description</label>
            <input value={newOffering.shortDescription} onChange={(e) => setNewOffering({ ...newOffering, shortDescription: e.target.value })}
              placeholder="One-liner for cards and lists" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500" />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
            <button onClick={createOffering} disabled={!newOffering.key || !newOffering.name}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50">Create</button>
          </div>
        </div>
      )}

      {/* Offerings list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-zinc-800/50 rounded-lg animate-pulse" />)}
        </div>
      ) : offerings.length === 0 ? (
        <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
          <Briefcase size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-500">No service offerings defined</p>
          <p className="text-xs text-zinc-600 mt-1">Create your first offering to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {offerings.map((offering) => {
            const expanded = expandedId === offering.id;
            return (
              <div key={offering.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-4">
                  <button onClick={() => setExpandedId(expanded ? null : offering.id)} className="text-zinc-500">
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white">{offering.name}</h3>
                      <span className="text-[10px] text-zinc-600 font-mono">{offering.key}</span>
                    </div>
                    {offering.shortDescription && (
                      <p className="text-xs text-zinc-500 mt-0.5">{offering.shortDescription}</p>
                    )}
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] border ${CATEGORY_COLORS[offering.category] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                    {offering.category}
                  </span>
                  <select value={offering.status} onChange={(e) => updateStatus(offering.id, e.target.value)}
                    className={`px-2 py-1 rounded text-[10px] border-0 ${STATUS_COLORS[offering.status] ?? 'bg-zinc-700 text-zinc-400'} focus:outline-none cursor-pointer`}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="deprecated">Deprecated</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button onClick={() => toggleWebsite(offering.id, offering.websiteVisible)}
                    className={`p-1 rounded ${offering.websiteVisible ? 'text-teal-400' : 'text-zinc-600'}`}
                    title={offering.websiteVisible ? 'Visible on website' : 'Hidden from website'}>
                    <Globe size={14} />
                  </button>
                  <button onClick={() => deleteOffering(offering.id)} className="text-zinc-600 hover:text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-zinc-800 p-4 space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-zinc-500 block">Pricing Model</span>
                        <span className="text-zinc-300">{offering.pricingModel}</span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block">Duration</span>
                        <span className="text-zinc-300">{offering.durationMonths ? `${offering.durationMonths} months` : 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block">Created</span>
                        <span className="text-zinc-300">{new Date(offering.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Components */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Components ({offering.componentsList.length})
                      </h4>
                      {offering.componentsList.length === 0 ? (
                        <p className="text-xs text-zinc-600">No components defined yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {offering.componentsList.map((comp) => (
                            <div key={comp.id} className="flex items-center gap-2 text-sm">
                              <span className="text-zinc-300">{comp.name}</span>
                              <span className="text-[10px] text-zinc-600">{comp.componentType}</span>
                              {comp.frequency && <span className="text-[10px] text-zinc-600">{comp.frequency}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Milestones */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Milestones ({offering.milestonesList.length})
                      </h4>
                      {offering.milestonesList.length === 0 ? (
                        <p className="text-xs text-zinc-600">No milestones defined yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {offering.milestonesList.map((ms) => (
                            <div key={ms.id} className="flex items-center gap-2 text-sm">
                              <span className="text-zinc-500 text-xs w-16">Month {ms.monthOffset}</span>
                              <span className="text-zinc-300">{ms.name}</span>
                              <span className="text-[10px] text-zinc-600">{ms.milestoneType}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
