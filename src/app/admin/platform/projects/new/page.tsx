'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Globe, Check, ChevronRight, Loader2, AlertCircle, Copy } from 'lucide-react';

type Step = 'details' | 'database' | 'dns' | 'complete';

interface ProjectDetails {
  key: string;
  name: string;
  description: string;
  subdomain: string;
  githubRepo: string;
}

interface ProvisionResult {
  success: boolean;
  message?: string;
  error?: string;
  connectionString?: string;
  password?: string;
  databaseName?: string;
  userName?: string;
}

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'details', label: 'Project Details', icon: <ChevronRight size={14} /> },
  { key: 'database', label: 'Database', icon: <Database size={14} /> },
  { key: 'dns', label: 'Subdomain', icon: <Globe size={14} /> },
  { key: 'complete', label: 'Complete', icon: <Check size={14} /> },
];

export default function NewProjectWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dbResult, setDbResult] = useState<ProvisionResult | null>(null);
  const [dnsResult, setDnsResult] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [details, setDetails] = useState<ProjectDetails>({
    key: '', name: '', description: '', subdomain: '', githubRepo: '',
  });

  function autoKey(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function createProject() {
    if (!details.key || !details.name) return;
    setLoading(true);
    setError(null);

    const res = await fetch('/api/platform/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...details,
        ecosystem: 'triarch-dev',
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to create project');
      setLoading(false);
      return;
    }

    setProjectId(data.id);
    setLoading(false);
    setCurrentStep('database');
  }

  async function provisionDatabase() {
    setLoading(true);
    setError(null);

    const res = await fetch('/api/platform/projects/provision-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        databaseName: details.key.replace(/-/g, '_'),
        userName: details.key,
      }),
    });

    const data = await res.json();
    setDbResult(data);

    if (data.success && projectId) {
      await fetch(`/api/platform/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crdbCluster: 'triarchdev-24092.j77.aws-us-east-2.cockroachlabs.cloud:26257',
          crdbDatabase: details.key.replace(/-/g, '_'),
          crdbUser: details.key,
        }),
      });
    }

    setLoading(false);
    if (data.success) setCurrentStep('dns');
  }

  async function provisionDns() {
    if (!details.subdomain) {
      setCurrentStep('complete');
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch('/api/platform/projects/provision-dns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain: details.subdomain }),
    });

    const data = await res.json();
    setDnsResult(data);

    if (data.success && projectId) {
      await fetch(`/api/platform/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain: details.subdomain,
          deployedUrl: `https://${details.subdomain}.triarch.dev`,
        }),
      });
    }

    setLoading(false);
    setCurrentStep('complete');
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <button onClick={() => router.push('/admin/platform/projects')}
        className="text-xs text-zinc-500 hover:text-zinc-300 mb-4 block">&larr; Back to projects</button>

      <h1 className="text-2xl font-bold text-white mb-2">New Project</h1>
      <p className="text-sm text-zinc-500 mb-8">Set up a new triarch.dev project with database and subdomain.</p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((step, i) => (
          <React.Fragment key={step.key}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              i < stepIndex ? 'bg-teal-500/20 text-teal-400' :
              i === stepIndex ? 'bg-zinc-700 text-white' :
              'bg-zinc-800/50 text-zinc-600'
            }`}>
              {i < stepIndex ? <Check size={12} /> : step.icon}
              {step.label}
            </div>
            {i < STEPS.length - 1 && <div className={`h-px w-8 ${i < stepIndex ? 'bg-teal-500/40' : 'bg-zinc-800'}`} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Step 1: Details */}
      {currentStep === 'details' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Project Name</label>
            <input value={details.name}
              onChange={(e) => setDetails({ ...details, name: e.target.value, key: details.key || autoKey(e.target.value) })}
              placeholder="My New App"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Key (unique identifier)</label>
            <input value={details.key}
              onChange={(e) => setDetails({ ...details, key: e.target.value })}
              placeholder="my-new-app"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 font-mono focus:outline-none focus:border-teal-500" />
            <p className="text-[10px] text-zinc-600 mt-1">Used for database name, DNS, and API references</p>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Description</label>
            <input value={details.description}
              onChange={(e) => setDetails({ ...details, description: e.target.value })}
              placeholder="What does this project do?"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Subdomain</label>
            <div className="flex items-center">
              <input value={details.subdomain}
                onChange={(e) => setDetails({ ...details, subdomain: e.target.value })}
                placeholder={details.key || 'my-app'}
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-l-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500" />
              <span className="px-3 py-2 bg-zinc-800 border border-l-0 border-zinc-700 rounded-r-md text-sm text-zinc-500">.triarch.dev</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">GitHub Repo (optional)</label>
            <input value={details.githubRepo}
              onChange={(e) => setDetails({ ...details, githubRepo: e.target.value })}
              placeholder="MyAlterLego/repo-name"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500" />
          </div>
          <button onClick={createProject} disabled={!details.key || !details.name || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 text-sm font-medium">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
            Create Project & Continue
          </button>
        </div>
      )}

      {/* Step 2: Database */}
      {currentStep === 'database' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <h3 className="text-sm font-medium text-white mb-2">Create CockroachDB Database</h3>
            <p className="text-xs text-zinc-500 mb-3">
              This will create database <span className="font-mono text-zinc-300">{details.key.replace(/-/g, '_')}</span> and
              SQL user <span className="font-mono text-zinc-300">{details.key}</span> on the triarchdev cluster.
            </p>
            {dbResult?.success ? (
              <div className="space-y-2">
                <div className="p-3 rounded bg-green-500/10 border border-green-500/20 text-sm text-green-400">
                  Database created successfully
                </div>
                <div className="relative">
                  <pre className="text-[10px] font-mono bg-zinc-800 p-3 rounded overflow-auto text-zinc-300">
                    {dbResult.connectionString}
                  </pre>
                  <button onClick={() => copyToClipboard(dbResult.connectionString ?? '')}
                    className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-300">
                    <Copy size={12} />
                  </button>
                </div>
                <p className="text-[10px] text-amber-400">Save this connection string — the password cannot be retrieved later.</p>
              </div>
            ) : dbResult?.error ? (
              <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-sm text-red-400">{dbResult.error}</div>
            ) : null}
          </div>
          <div className="flex gap-2">
            {!dbResult?.success && (
              <button onClick={provisionDatabase} disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-50 text-sm font-medium">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                Create Database
              </button>
            )}
            <button onClick={() => setCurrentStep('dns')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium ${
                dbResult?.success ? 'flex-1 bg-teal-600 text-white hover:bg-teal-500' : 'text-zinc-400 hover:text-zinc-200'
              }`}>
              {dbResult?.success ? 'Continue' : 'Skip'} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: DNS */}
      {currentStep === 'dns' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <h3 className="text-sm font-medium text-white mb-2">Configure Subdomain</h3>
            {details.subdomain ? (
              <>
                <p className="text-xs text-zinc-500 mb-3">
                  This will create an A record for <span className="font-mono text-zinc-300">{details.subdomain}.triarch.dev</span> pointing to Firebase App Hosting.
                </p>
                {dnsResult?.success ? (
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20 text-sm text-green-400">
                    DNS record created. Propagation may take up to 10 minutes.
                  </div>
                ) : dnsResult?.error ? (
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-sm text-red-400">{dnsResult.error}</div>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-zinc-500">No subdomain specified. You can add one later from the project settings.</p>
            )}
          </div>
          <div className="flex gap-2">
            {details.subdomain && !dnsResult?.success && (
              <button onClick={provisionDns} disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-500 disabled:opacity-50 text-sm font-medium">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                Create DNS Record
              </button>
            )}
            <button onClick={() => setCurrentStep('complete')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium ${
                dnsResult?.success || !details.subdomain ? 'flex-1 bg-teal-600 text-white hover:bg-teal-500' : 'text-zinc-400 hover:text-zinc-200'
              }`}>
              {dnsResult?.success || !details.subdomain ? 'Continue' : 'Skip'} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {currentStep === 'complete' && (
        <div className="space-y-4">
          <div className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 text-center">
            <div className="w-12 h-12 rounded-full bg-teal-500/20 flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-teal-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{details.name} is ready</h3>
            <p className="text-sm text-zinc-500">Your project has been registered in the triarch.dev control plane.</p>

            <div className="mt-6 text-left grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-zinc-500 block">Key</span>
                <span className="text-zinc-300 font-mono">{details.key}</span>
              </div>
              {dbResult?.success && (
                <div>
                  <span className="text-zinc-500 block">Database</span>
                  <span className="text-zinc-300 font-mono">{details.key.replace(/-/g, '_')}</span>
                </div>
              )}
              {dnsResult?.success && (
                <div>
                  <span className="text-zinc-500 block">Domain</span>
                  <span className="text-zinc-300">{details.subdomain}.triarch.dev</span>
                </div>
              )}
              {details.githubRepo && (
                <div>
                  <span className="text-zinc-500 block">GitHub</span>
                  <span className="text-zinc-300">{details.githubRepo}</span>
                </div>
              )}
            </div>
          </div>

          <button onClick={() => router.push('/admin/platform/projects')}
            className="w-full px-4 py-3 bg-teal-600 text-white rounded-md hover:bg-teal-500 text-sm font-medium">
            Go to Projects
          </button>
        </div>
      )}
    </div>
  );
}
