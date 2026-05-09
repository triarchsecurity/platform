'use client';

import type { MouseEvent } from 'react';
import { ExternalLink } from 'lucide-react';

interface Props {
  url: string | null;
}

/**
 * Inline external-link icon for a release row's preview / prod URL.
 * - url provided     → anchor opens in new tab; click does not bubble (pitfall 3 prevents row toggle)
 * - url null         → disabled icon-only button with tooltip "No preview deployed" (D-07)
 * Icon-only by design (D-08); full URL surfaced via title= and aria-label=.
 */
export default function PreviewLink({ url }: Props) {
  if (!url) {
    return (
      <button
        type="button"
        disabled
        aria-label="No preview deployed"
        title="No preview deployed"
        className="p-1 text-zinc-700 cursor-default"
      >
        <ExternalLink size={12} aria-hidden="true" />
      </button>
    );
  }

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Prevent the parent <tr> onClick (toggleExpanded) from firing — pitfall 3 in RESEARCH.md
    e.stopPropagation();
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open preview — ${url}`}
      title={url}
      onClick={handleClick}
      className="p-1 text-zinc-500 hover:text-teal-400 transition-colors inline-flex items-center"
    >
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}
