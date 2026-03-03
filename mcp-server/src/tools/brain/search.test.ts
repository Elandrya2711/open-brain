import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../embeddings.js');
vi.mock('../../db.js');

import { tool } from './search.js';
import { generateEmbedding } from '../../embeddings.js';
import { similaritySearch } from '../../db.js';

const mockedGenerateEmbedding = vi.mocked(generateEmbedding);
const mockedSimilaritySearch = vi.mocked(similaritySearch);

describe('semantic_search tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockedSimilaritySearch.mockResolvedValue([]);
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

    expect(mockedGenerateEmbedding).toHaveBeenCalledWith('test query');
    expect(mockedSimilaritySearch).toHaveBeenCalledWith(expect.any(Array), 10);
    expect(result.success).toBe(true);
  });

  it('should respect limit parameter', async () => {
    await tool.handler({
      query: 'test query',
      limit: 5,
    });

    expect(mockedSimilaritySearch).toHaveBeenCalledWith(expect.any(Array), 5);
  });

  it('should clamp limit to max 100', async () => {
    await tool.handler({
      query: 'test query',
      limit: 200,
    });
    expect(mockedSimilaritySearch).toHaveBeenCalledWith(expect.any(Array), 100);
  });

  it('should reject empty query', async () => {
    const result = await tool.handler({
      query: '',
    });

    // Empty string is falsy, so !input.query catches it before trim check
    expect(result).toEqual({
      success: false,
      error: 'Query is required and must be a string',
    });
    expect(mockedGenerateEmbedding).not.toHaveBeenCalled();
  });

  it('should reject undefined query', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'Query is required and must be a string',
    });
  });

  it('should handle embedding generation errors', async () => {
    mockedGenerateEmbedding.mockRejectedValueOnce(new Error('API Error'));

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

    mockedSimilaritySearch.mockResolvedValueOnce(mockMemories);

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
