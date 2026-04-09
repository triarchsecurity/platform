'use client';

import React, { useEffect, useState } from 'react';
import { Settings, ToggleLeft, ToggleRight } from 'lucide-react';

interface ModuleConfig {
  key: string;
  label: string;
  description: string;
  enabledKey: string;
}

const MODULES: ModuleConfig[] = [
  { key: 'navigation', label: 'DB-Driven Navigation', description: 'Menu structure managed from database', enabledKey: 'enabled' },
  { key: 'release_logs', label: 'Release Audit Logging', description: 'Track releases and changelogs across projects', enabledKey: 'enabled' },
  { key: 'access_logging', label: 'Access Logging', description: 'Audit trail for admin role assumptions', enabledKey: 'enabled' },
  { key: 'bug_feature_portal', label: 'Bug & Feature Portal', description: 'Bug reports and feature requests from users', enabledKey: 'enabled' },
];

export default function SettingsPage() {
  const [moduleStates, setModuleStates] = useState<Record<string, Record<string, unknown>>>({});
  const [navPrefs, setNavPrefs] = useState<{ collapsed: boolean; compact: boolean }>({ collapsed: false, compact: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const allFetches = [
        ...MODULES.map((mod) => fetch(`/api/platform/settings?module=${mod.key}`).then((r) => r.json())),
        fetch('/api/platform/settings?module=navigation&project=triarch-dev').then((r) => r.json()),
      ];

      const results = await Promise.all(allFetches);
      const states: Record<string, Record<string, unknown>> = {};
      MODULES.forEach((mod, i) => { states[mod.key] = results[i].settings ?? {}; });
      setModuleStates(states);

      const navData = results[results.length - 1];
      if (navData.settings) {
        setNavPrefs({
          collapsed: navData.settings.sidebar_collapsed ?? false,
          compact: navData.settings.compact_mode ?? false,
        });
      }

      setLoading(false);
    }
    load();
  }, []);

  async function toggleModule(moduleKey: string) {
    const current = moduleStates[moduleKey] ?? {};
    const newEnabled = !(current.enabled ?? true);
    setSaving(moduleKey);

    await fetch('/api/platform/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: moduleKey,
        scope: 'global',
        settings: { ...current, enabled: newEnabled },
      }),
    });

    setModuleStates((prev) => ({
      ...prev,
      [moduleKey]: { ...current, enabled: newEnabled },
    }));
    setSaving(null);
  }

  async function updateNavPrefs(update: Partial<typeof navPrefs>) {
    const newPrefs = { ...navPrefs, ...update };
    setNavPrefs(newPrefs);
    setSaving('nav');

    await fetch('/api/platform/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: 'navigation',
        scope: 'user',
        settings: {
          sidebar_collapsed: newPrefs.collapsed,
          compact_mode: newPrefs.compact,
        },
      }),
    });
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <div className="mt-8 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800/50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <Settings size={24} className="text-zinc-500" />
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Module settings and platform configuration</p>
        </div>
      </div>

      {/* Module toggles */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Modules</h2>
        <div className="space-y-2">
          {MODULES.map((mod) => {
            const enabled = (moduleStates[mod.key]?.enabled ?? true) as boolean;
            return (
              <div key={mod.key} className="flex items-center justify-between p-4 rounded-lg bg-zinc-900 border border-zinc-800">
                <div>
                  <h3 className="text-sm font-medium text-white">{mod.label}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{mod.description}</p>
                </div>
                <button
                  onClick={() => toggleModule(mod.key)}
                  className={`transition-colors ${saving === mod.key ? 'opacity-50' : ''}`}
                  disabled={saving === mod.key}
                >
                  {enabled ? (
                    <ToggleRight size={28} className="text-teal-400" />
                  ) : (
                    <ToggleLeft size={28} className="text-zinc-600" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Navigation preferences */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Navigation Preferences</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <div>
              <h3 className="text-sm font-medium text-white">Sidebar collapsed by default</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Start with the narrow icon-only sidebar</p>
            </div>
            <button onClick={() => updateNavPrefs({ collapsed: !navPrefs.collapsed })}>
              {navPrefs.collapsed ? (
                <ToggleRight size={28} className="text-teal-400" />
              ) : (
                <ToggleLeft size={28} className="text-zinc-600" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <div>
              <h3 className="text-sm font-medium text-white">Compact mode</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Reduced padding on navigation items</p>
            </div>
            <button onClick={() => updateNavPrefs({ compact: !navPrefs.compact })}>
              {navPrefs.compact ? (
                <ToggleRight size={28} className="text-teal-400" />
              ) : (
                <ToggleLeft size={28} className="text-zinc-600" />
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
