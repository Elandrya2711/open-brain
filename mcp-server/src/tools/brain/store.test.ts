import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tool } from './store.js';
import * as embeddings from '../../__mocks__/embeddings.js';
import * as db from '../../__mocks__/db.js';

vi.mock('../../embeddings.js', () => embeddings);
vi.mock('../../db.js', () => db);

describe('store_memory tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(embeddings.generateEmbedding).toHaveBeenCalledWith('Test memory content');
    expect(db.insertMemory).toHaveBeenCalled();
  });

  it('should use default type when not provided', async () => {
    const result = await tool.handler({
      content: 'Test memory',
    });

    expect(result.success).toBe(true);
    expect(db.insertMemory).toHaveBeenCalled();
  });

  it('should reject empty content', async () => {
    const result = await tool.handler({
      content: '',
    });

    expect(result).toEqual({
      success: false,
      error: 'Content cannot be empty',
    });
    expect(embeddings.generateEmbedding).not.toHaveBeenCalled();
  });

  it('should reject undefined content', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'Content is required and must be a string',
    });
  });

  it('should handle embedding generation errors', async () => {
    embeddings.generateEmbedding.mockRejectedValueOnce(new Error('API Error'));

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

    expect(db.insertMemory).toHaveBeenCalledWith(
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
      const result = await tool.handler({
        content: 'Test memory',
        type,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain(`type: ${type}`);
    }
  });
});
