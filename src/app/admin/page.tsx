import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, releaseLogs, bugReports, featureRequests } from '@/db/schema';
import { eq, sql, and } from 'drizzle-orm';
import {
  FileText,
  Bug,
  Settings,
  Briefcase,
  Activity,
  Shield,
  Lightbulb,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';

async function getDashboardStats() {
  const [
    projectCount,
    releaseCount,
    openBugs,
    pendingFeatures,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(projects),
    db.select({ count: sql<number>`count(*)` }).from(releaseLogs),
    db.select({ count: sql<number>`count(*)` }).from(bugReports)
      .where(and(
        sql`${bugReports.status} NOT IN ('closed', 'verified')`,
      )),
    db.select({ count: sql<number>`count(*)` }).from(featureRequests)
      .where(and(
        sql`${featureRequests.status} NOT IN ('shipped', 'closed', 'declined')`,
      )),
  ]);

  return {
    projects: Number(projectCount[0].count),
    releases: Number(releaseCount[0].count),
    openBugs: Number(openBugs[0].count),
    pendingFeatures: Number(pendingFeatures[0].count),
  };
}

const modules = [
  { title: 'Projects', description: 'Manage triarch.dev projects & infrastructure', icon: Briefcase, href: '/admin/platform/projects', color: 'text-teal-400' },
  { title: 'Release Logs', description: 'Track releases across all projects', icon: FileText, href: '/admin/modules/release-logs', color: 'text-blue-400' },
  { title: 'Bug Reports', description: 'Triage and track bugs across projects', icon: Bug, href: '/admin/modules/bug-reports', color: 'text-red-400' },
  { title: 'Feature Requests', description: 'Review and prioritize feature requests', icon: Lightbulb, href: '/admin/modules/feature-requests', color: 'text-amber-400' },
  { title: 'Navigation', description: 'DB-driven menu editor', icon: Activity, href: '/admin/platform/navigation', color: 'text-green-400' },
  { title: 'Access Audit', description: 'Role assumption & access logs', icon: Shield, href: '/admin/modules/access-audit', color: 'text-purple-400' },
  { title: 'Service Offerings', description: 'Manage service offerings & pricing', icon: BookOpen, href: '/admin/modules/service-offerings', color: 'text-cyan-400' },
  { title: 'Reports', description: 'Build modular status reports', icon: FileText, href: '/admin/modules/reports', color: 'text-indigo-400' },
  { title: 'Settings', description: 'Module settings & configuration', icon: Settings, href: '/admin/settings', color: 'text-zinc-400' },
];

export default async function AdminDashboard() {
  const [session, stats] = await Promise.all([
    getServerSession(authOptions),
    getDashboardStats(),
  ]);

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-wide">
          Central Management Dashboard
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Welcome back, {session?.user?.name ?? 'Admin'}
        </p>
      </div>

      {/* Live stats */}
      <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Projects', value: stats.projects, color: 'text-teal-400', href: '/admin/platform/projects' },
          { label: 'Releases', value: stats.releases, color: 'text-blue-400', href: '/admin/modules/release-logs' },
          { label: 'Open Bugs', value: stats.openBugs, color: stats.openBugs > 0 ? 'text-red-400' : 'text-green-400', href: '/admin/modules/bug-reports' },
          { label: 'Pending Features', value: stats.pendingFeatures, color: 'text-amber-400', href: '/admin/modules/feature-requests' },
        ].map((stat) => (
          <Link key={stat.label} href={stat.href}
            className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors">
            <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-zinc-500 font-medium mt-1">{stat.label}</div>
          </Link>
        ))}
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className="group block p-5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${mod.color}`}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="font-medium text-white group-hover:text-teal-400 transition-colors">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">{mod.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
