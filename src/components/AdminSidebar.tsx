'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { DynamicSidebar } from '@myalterlego/shared-ui';
import { APP_VERSION } from '@/lib/version';

/**
 * AdminSidebar — thin wrapper around DynamicSidebar from @myalterlego/shared-ui (DEV-04)
 * Navigation data fetched from /api/platform/navigation
 * Preserves named export so admin/layout.tsx needs no changes.
 */
export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;

  const logoSlot = (
    <div className="px-5 py-5">
      <span
        className="text-xl font-bold tracking-widest uppercase"
        style={{ color: 'var(--accent-gold)' }}
      >
        TRIARCH
      </span>
      <span
        className="block text-xs tracking-widest mt-0.5"
        style={{ color: 'var(--text-muted)' }}
      >
        DEV CONSOLE
      </span>
    </div>
  );

  const footerSlot = (
    <div className="px-5 py-3 space-y-2">
      {email && (
        <>
          <div
            className="text-[11px] truncate"
            style={{ color: 'var(--text-muted)' }}
            title={email}
          >
            {email}
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-[11px] tracking-wide uppercase font-medium hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Sign out"
          >
            <LogOut size={12} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </>
      )}
      <span className="block text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
        {APP_VERSION}
      </span>
    </div>
  );

  return (
    <DynamicSidebar
      project="triarch-dev"
      authToken="cookie"
      userRole="admin"
      apiBase=""
      currentPath={pathname}
      logoSlot={logoSlot}
      footerSlot={footerSlot}
    />
  );
}
