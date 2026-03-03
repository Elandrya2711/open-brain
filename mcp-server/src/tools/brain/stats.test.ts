import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db.js');

import { tool } from './stats.js';
import { getStats } from '../../db.js';

const mockedGetStats = vi.mocked(getStats);

describe('get_stats tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetStats.mockResolvedValue({
      total: 0,
      byType: {},
      oldestDate: '',
      newestDate: '',
    });
  });

  it('should return empty stats when no memories exist', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: true,
      total: 0,
      byType: {},
      dateRange: {
        oldest: '',
        newest: '',
      },
    });
  });

  it('should return correct stats', async () => {
    mockedGetStats.mockResolvedValueOnce({
      total: 42,
      byType: {
        note: 25,
        qa: 10,
        chat: 7,
      },
      oldestDate: '2024-01-01',
      newestDate: '2024-01-15',
    });

    const result = await tool.handler({});

    expect(result).toEqual({
      success: true,
      total: 42,
      byType: {
        note: 25,
        qa: 10,
        chat: 7,
      },
      dateRange: {
        oldest: '2024-01-01',
        newest: '2024-01-15',
      },
    });
  });

  it('should handle database errors', async () => {
    mockedGetStats.mockRejectedValueOnce(new Error('DB Error'));

    const result = await tool.handler({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to get stats');
  });
});
