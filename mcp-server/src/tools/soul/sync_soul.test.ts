import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db.js');

import { tool } from './sync_soul.js';
import { syncSoul } from '../../db.js';

const mockedSyncSoul = vi.mocked(syncSoul);

describe('sync_soul tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSyncSoul.mockResolvedValue({
      id: 'test-soul-uuid-new',
      content: 'mocked',
      valid_from: new Date().toISOString(),
      valid_until: null,
    });
  });

  it('should create a new soul version', async () => {
    const content = '# My Soul\nI am helpful and kind.';
    const result = await tool.handler({ content });

    expect(result).toEqual({
      success: true,
      version: {
        id: 'test-soul-uuid-new',
        valid_from: expect.any(String),
      },
      message: 'Soul updated successfully.',
    });
    expect(mockedSyncSoul).toHaveBeenCalledWith(content);
  });

  it('should reject empty content', async () => {
    const result = await tool.handler({ content: '' });

    // Empty string is falsy, so !input.content catches it before trim check
    expect(result.success).toBe(false);
    expect(result.error).toContain('Content is required');
    expect(mockedSyncSoul).not.toHaveBeenCalled();
  });

  it('should reject whitespace-only content', async () => {
    const result = await tool.handler({ content: '   ' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Content cannot be empty');
    expect(mockedSyncSoul).not.toHaveBeenCalled();
  });

  it('should reject missing content', async () => {
    const result = await tool.handler({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Content is required');
    expect(mockedSyncSoul).not.toHaveBeenCalled();
  });

  it('should handle database errors', async () => {
    mockedSyncSoul.mockRejectedValueOnce(new Error('Transaction failed'));

    const result = await tool.handler({ content: 'Test soul' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to sync soul');
  });
});
