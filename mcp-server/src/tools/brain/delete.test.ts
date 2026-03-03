import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db.js');

import { tool } from './delete.js';
import { deleteMemory } from '../../db.js';

const mockedDeleteMemory = vi.mocked(deleteMemory);

describe('delete_memory tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeleteMemory.mockResolvedValue(true);
  });

  it('should delete memory successfully', async () => {
    const result = await tool.handler({
      id: 'test-id',
    });

    expect(result).toEqual({
      success: true,
      message: 'Memory test-id deleted successfully',
    });
    expect(mockedDeleteMemory).toHaveBeenCalledWith('test-id');
  });

  it('should return error when memory not found', async () => {
    mockedDeleteMemory.mockResolvedValueOnce(false);

    const result = await tool.handler({
      id: 'nonexistent-id',
    });

    expect(result).toEqual({
      success: false,
      error: 'Memory not found',
    });
  });

  it('should reject undefined id', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'ID is required and must be a string',
    });
  });

  it('should reject non-string id', async () => {
    const result = await tool.handler({
      id: 123 as any,
    });

    expect(result).toEqual({
      success: false,
      error: 'ID is required and must be a string',
    });
  });

  it('should handle database errors', async () => {
    mockedDeleteMemory.mockRejectedValueOnce(new Error('DB Error'));

    const result = await tool.handler({
      id: 'test-id',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to delete memory');
  });
});
