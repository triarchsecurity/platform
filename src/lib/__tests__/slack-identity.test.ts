import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@triarchsecurity/secrets', () => ({
  getSecret: vi.fn(),
}));

import { getSecret } from '@triarchsecurity/secrets';
import { resolveSlackUserEmail } from '../slack-identity';

const mockedGetSecret = vi.mocked(getSecret);

beforeEach(() => {
  mockedGetSecret.mockReset();
});

describe('resolveSlackUserEmail', () => {
  it('resolves known user_id', async () => {
    mockedGetSecret.mockResolvedValue('{"U0AJM4MP2N6":"mike@triarchsecurity.com"}');
    const email = await resolveSlackUserEmail('U0AJM4MP2N6');
    expect(email).toBe('mike@triarchsecurity.com');
  });

  it('returns null for unknown user_id', async () => {
    mockedGetSecret.mockResolvedValue('{"U0AJM4MP2N6":"mike@triarchsecurity.com"}');
    const email = await resolveSlackUserEmail('UUNKNOWN');
    expect(email).toBeNull();
  });

  it('returns null for null input without calling vault', async () => {
    const email = await resolveSlackUserEmail(null);
    expect(email).toBeNull();
    expect(mockedGetSecret).not.toHaveBeenCalled();
  });

  it('returns null for undefined input without calling vault', async () => {
    const email = await resolveSlackUserEmail(undefined);
    expect(email).toBeNull();
    expect(mockedGetSecret).not.toHaveBeenCalled();
  });

  it('returns null when vault read fails', async () => {
    mockedGetSecret.mockRejectedValue(new Error('PERMISSION_DENIED'));
    const email = await resolveSlackUserEmail('U0AJM4MP2N6');
    expect(email).toBeNull();
  });

  it('returns null when vault returns malformed JSON', async () => {
    mockedGetSecret.mockResolvedValue('not-json');
    const email = await resolveSlackUserEmail('U0AJM4MP2N6');
    expect(email).toBeNull();
  });
});
