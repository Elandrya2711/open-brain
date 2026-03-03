import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db.js');

import { tool } from './get_soul.js';
import { getActiveSoul } from '../../db.js';

const mockedGetActiveSoul = vi.mocked(getActiveSoul);

describe('get_soul tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActiveSoul.mockResolvedValue({
      id: 'test-soul-uuid',
      content: '# Test Soul\nThis is a test soul.',
      valid_from: '2025-01-01T00:00:00.000Z',
      valid_until: null,
    });
  });

  it('should return the active soul', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: true,
      found: true,
      soul: {
        id: 'test-soul-uuid',
        content: '# Test Soul\nThis is a test soul.',
        valid_from: '2025-01-01T00:00:00.000Z',
        valid_until: null,
      },
    });
    expect(mockedGetActiveSoul).toHaveBeenCalledWith(undefined);
  });

  it('should return not-found when no soul exists', async () => {
    mockedGetActiveSoul.mockResolvedValueOnce(null);

    const result = await tool.handler({});

    expect(result.success).toBe(true);
    expect(result.found).toBe(false);
    expect(result.message).toContain('sync_soul');
  });

  it('should pass timestamp when "at" is provided', async () => {
    const at = '2025-06-15T12:00:00Z';
    await tool.handler({ at });

    expect(mockedGetActiveSoul).toHaveBeenCalledWith(at);
  });

  it('should return not-found message with timestamp when "at" finds nothing', async () => {
    mockedGetActiveSoul.mockResolvedValueOnce(null);
    const at = '2020-01-01T00:00:00Z';

    const result = await tool.handler({ at });

    expect(result.success).toBe(true);
    expect(result.found).toBe(false);
    expect(result.message).toContain(at);
  });

  it('should reject invalid timestamp', async () => {
    const result = await tool.handler({ at: 'not-a-date' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid timestamp');
    expect(mockedGetActiveSoul).not.toHaveBeenCalled();
  });

  it('should handle database errors', async () => {
    mockedGetActiveSoul.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await tool.handler({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to retrieve soul');
  });
});
