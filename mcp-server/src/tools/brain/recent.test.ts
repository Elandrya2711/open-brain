import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db.js');

import { tool } from './recent.js';
import { getRecentMemories } from '../../db.js';

const mockedGetRecentMemories = vi.mocked(getRecentMemories);

describe('list_recent tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetRecentMemories.mockResolvedValue([]);
  });

  it('should list recent memories with default days', async () => {
    const result = await tool.handler({});

    expect(mockedGetRecentMemories).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      success: true,
      count: 0,
      days: 7,
      memories: [],
    });
  });

  it('should respect days parameter', async () => {
    await tool.handler({
      days: 30,
    });

    expect(mockedGetRecentMemories).toHaveBeenCalledWith(30);
  });

  it('should enforce minimum days value', async () => {
    await tool.handler({
      days: -5,
    });

    // Math.max(-5 || 7, 1) = Math.max(7, 1) = 7 (falsy 0 falls back to default 7)
    // Using -5 which is truthy but less than 1, so Math.max(-5, 1) = 1
    expect(mockedGetRecentMemories).toHaveBeenCalledWith(1);
  });

  it('should return formatted memory list', async () => {
    const mockMemories = [
      {
        id: '1',
        content: 'Long test content that should be truncated at 200 characters to keep responses concise',
        summary: 'Summary',
        embedding: [0.1],
        type: 'note',
        source: 'claude-code',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    ];

    mockedGetRecentMemories.mockResolvedValueOnce(mockMemories);

    const result = await tool.handler({
      days: 7,
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.memories[0]).toEqual({
      id: '1',
      content: 'Long test content that should be truncated at 200 characters to keep responses concise',
      summary: 'Summary',
      type: 'note',
      createdAt: '2024-01-01',
    });
  });

  it('should handle database errors', async () => {
    mockedGetRecentMemories.mockRejectedValueOnce(new Error('DB Error'));

    const result = await tool.handler({
      days: 7,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to list recent memories');
  });
});
