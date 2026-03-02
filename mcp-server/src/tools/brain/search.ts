import { generateEmbedding } from '../../embeddings.js';
import { similaritySearch } from '../../db.js';

export const tool = {
  name: 'semantic_search',
  description: 'Search for memories based on semantic meaning of a query',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
        default: 10,
      },
    },
    required: ['query'],
  },
  handler: async (input: { query?: string; limit?: number }) => {
    if (!input.query || typeof input.query !== 'string') {
      return {
        success: false,
        error: 'Query is required and must be a string',
      };
    }

    if (input.query.trim().length === 0) {
      return {
        success: false,
        error: 'Query cannot be empty',
      };
    }

    try {
      const embedding = await generateEmbedding(input.query);
      const limit = Math.min(Math.max(input.limit || 10, 1), 100);
      const results = await similaritySearch(embedding, limit);

      return {
        success: true,
        count: results.length,
        results: results.map(r => ({
          id: r.id,
          content: r.content,
          summary: r.summary,
          type: r.type,
          createdAt: r.created_at,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Search failed: ${message}`,
      };
    }
  },
};
