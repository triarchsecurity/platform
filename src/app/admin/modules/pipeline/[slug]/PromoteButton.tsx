'use client';

/**
 * PromoteButton — inert stub for plan 09-04.
 *
 * Plan 09-05 replaces this stub with the real two-step interactive client island
 * that calls POST /api/admin/releases/<id>/promote, shows an inline confirm step,
 * dispatches the promotion, and displays a spinner + terminal-state pill.
 */
export default function PromoteButton({
  releaseId: _releaseId,
  branch,
  version,
}: {
  releaseId: string;
  branch: string;
  version: string;
}) {
  return (
    <button
      disabled
      aria-label={`Promote ${branch} ${version} to production`}
      className="px-3 py-1 text-xs rounded bg-zinc-800 text-zinc-400 cursor-not-allowed"
    >
      Promote
    </button>
  );
}
