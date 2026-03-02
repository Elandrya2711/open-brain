import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tool } from './recent.js';
import * as db from '../../__mocks__/db.js';

vi.mock('../../db.js', () => db);

describe('list_recent tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list recent memories with default days', async () => {
    const result = await tool.handler({});

    expect(db.getRecentMemories).toHaveBeenCalledWith(7);
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

    expect(db.getRecentMemories).toHaveBeenCalledWith(30);
  });

  it('should enforce minimum days value', async () => {
    await tool.handler({
      days: 0,
    });

    expect(db.getRecentMemories).toHaveBeenCalledWith(1);
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

    db.getRecentMemories.mockResolvedValueOnce(mockMemories);

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
    db.getRecentMemories.mockRejectedValueOnce(new Error('DB Error'));

    const result = await tool.handler({
      days: 7,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to list recent memories');
  });
});
