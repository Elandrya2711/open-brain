import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tool } from './search.js';
import * as embeddings from '../../__mocks__/embeddings.js';
import * as db from '../../__mocks__/db.js';

vi.mock('../../embeddings.js', () => embeddings);
vi.mock('../../db.js', () => db);

describe('semantic_search tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty list when no memories exist', async () => {
    const result = await tool.handler({
      query: 'test query',
    });

    expect(result).toEqual({
      success: true,
      count: 0,
      results: [],
    });
  });

  it('should search with default limit', async () => {
    const result = await tool.handler({
      query: 'test query',
    });

    expect(embeddings.generateEmbedding).toHaveBeenCalledWith('test query');
    expect(db.similaritySearch).toHaveBeenCalledWith(expect.any(Array), 10);
    expect(result.success).toBe(true);
  });

  it('should respect limit parameter', async () => {
    await tool.handler({
      query: 'test query',
      limit: 5,
    });

    expect(db.similaritySearch).toHaveBeenCalledWith(expect.any(Array), 5);
  });

  it('should clamp limit between 1 and 100', async () => {
    await tool.handler({
      query: 'test query',
      limit: 0,
    });
    expect(db.similaritySearch).toHaveBeenCalledWith(expect.any(Array), 1);

    vi.clearAllMocks();

    await tool.handler({
      query: 'test query',
      limit: 200,
    });
    expect(db.similaritySearch).toHaveBeenCalledWith(expect.any(Array), 100);
  });

  it('should reject empty query', async () => {
    const result = await tool.handler({
      query: '',
    });

    expect(result).toEqual({
      success: false,
      error: 'Query cannot be empty',
    });
    expect(embeddings.generateEmbedding).not.toHaveBeenCalled();
  });

  it('should reject undefined query', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'Query is required and must be a string',
    });
  });

  it('should handle embedding generation errors', async () => {
    embeddings.generateEmbedding.mockRejectedValueOnce(new Error('API Error'));

    const result = await tool.handler({
      query: 'test query',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Search failed');
  });

  it('should format search results correctly', async () => {
    const mockMemories = [
      {
        id: '1',
        content: 'Test content 1',
        summary: 'Summary 1',
        embedding: [0.1],
        type: 'note',
        source: 'claude-code',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    ];

    db.similaritySearch.mockResolvedValueOnce(mockMemories);

    const result = await tool.handler({
      query: 'test',
    });

    expect(result.count).toBe(1);
    expect(result.results[0]).toEqual({
      id: '1',
      content: 'Test content 1',
      summary: 'Summary 1',
      type: 'note',
      createdAt: '2024-01-01',
    });
  });
});
