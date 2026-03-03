import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../embeddings.js');
vi.mock('../../db.js');

import { tool } from './store.js';
import { generateEmbedding } from '../../embeddings.js';
import { insertMemory } from '../../db.js';

const mockedGenerateEmbedding = vi.mocked(generateEmbedding);
const mockedInsertMemory = vi.mocked(insertMemory);

describe('store_memory tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockedInsertMemory.mockResolvedValue('test-uuid-123');
  });

  it('should store memory successfully', async () => {
    const result = await tool.handler({
      content: 'Test memory content',
      type: 'note',
    });

    expect(result).toEqual({
      success: true,
      id: expect.any(String),
      message: 'Memory stored successfully with type: note',
    });
    expect(mockedGenerateEmbedding).toHaveBeenCalledWith('Test memory content');
    expect(mockedInsertMemory).toHaveBeenCalled();
  });

  it('should use default type when not provided', async () => {
    const result = await tool.handler({
      content: 'Test memory',
    });

    expect(result.success).toBe(true);
    expect(mockedInsertMemory).toHaveBeenCalled();
  });

  it('should reject empty content', async () => {
    const result = await tool.handler({
      content: '',
    });

    expect(result).toEqual({
      success: false,
      error: 'Content is required and must be a string',
    });
    expect(mockedGenerateEmbedding).not.toHaveBeenCalled();
  });

  it('should reject undefined content', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'Content is required and must be a string',
    });
  });

  it('should handle embedding generation errors', async () => {
    mockedGenerateEmbedding.mockRejectedValueOnce(new Error('API Error'));

    const result = await tool.handler({
      content: 'Test memory',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to store memory');
  });

  it('should support summary field', async () => {
    await tool.handler({
      content: 'Test memory',
      summary: 'Test summary',
    });

    expect(mockedInsertMemory).toHaveBeenCalledWith(
      'Test memory',
      expect.any(Array),
      'note',
      'claude-code',
      'Test summary'
    );
  });

  it('should support all memory types', async () => {
    const types: Array<'qa' | 'chat' | 'note'> = ['qa', 'chat', 'note'];

    for (const type of types) {
      vi.clearAllMocks();
      mockedGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockedInsertMemory.mockResolvedValue('test-uuid-123');

      const result = await tool.handler({
        content: 'Test memory',
        type,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain(`type: ${type}`);
    }
  });
});
