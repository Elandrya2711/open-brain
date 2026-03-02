import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tool } from './stats.js';
import * as db from '../../__mocks__/db.js';

vi.mock('../../db.js', () => db);

describe('get_stats tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    db.getStats.mockResolvedValueOnce({
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
    db.getStats.mockRejectedValueOnce(new Error('DB Error'));

    const result = await tool.handler({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to get stats');
  });
});
