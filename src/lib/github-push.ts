/**
 * Push a map of files to a GitHub repo as a single atomic commit.
 *
 * Uses the Git Data API (blobs → tree → commit → ref update) so all files
 * land in one commit. The repo must already exist and have at least one
 * commit on `branch` (typically the auto-init README from repo creation).
 */
export async function pushFilesToRepo(opts: {
  owner: string;
  repo: string;
  branch?: string;
  files: Record<string, string>;
  commitMessage: string;
  ghToken: string;
}): Promise<{ commitSha: string; commitUrl: string }> {
  const { owner, repo, branch = 'main', files, commitMessage, ghToken } = opts;
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${ghToken}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  async function gh<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, { ...init, headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub ${init?.method || 'GET'} ${path} failed: ${res.status} ${body}`);
    }
    return res.json() as Promise<T>;
  }

  const ref = await gh<{ object: { sha: string } }>(`/git/refs/heads/${branch}`);
  const baseCommitSha = ref.object.sha;

  const baseCommit = await gh<{ tree: { sha: string } }>(`/git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree.sha;

  const blobs: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  for (const [path, content] of Object.entries(files)) {
    const blob = await gh<{ sha: string }>(`/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });
    blobs.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const newTree = await gh<{ sha: string }>(`/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs }),
  });

  const newCommit = await gh<{ sha: string; html_url: string }>(`/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: commitMessage,
      tree: newTree.sha,
      parents: [baseCommitSha],
    }),
  });

  await gh(`/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });

  return { commitSha: newCommit.sha, commitUrl: newCommit.html_url };
}

export async function registerDeployWebhook(opts: {
  owner: string;
  repo: string;
  webhookUrl: string;
  secret: string;
  ghToken: string;
}): Promise<{ id: number } | null> {
  const { owner, repo, webhookUrl, secret, ghToken } = opts;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'web',
      active: true,
      events: ['workflow_run', 'release'],
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret,
        insecure_ssl: '0',
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`Failed to register webhook for ${owner}/${repo}: ${res.status} ${body}`);
    return null;
  }
  return res.json() as Promise<{ id: number }>;
}
