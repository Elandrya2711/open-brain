import { generateEmbedding } from '../../embeddings.js';
import { insertMemory } from '../../db.js';

export const tool = {
  name: 'store_memory',
  description: 'Store a piece of knowledge or context with semantic embedding for later retrieval',
  inputSchema: {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string',
        description: 'The memory content to store',
      },
      type: {
        type: 'string',
        enum: ['qa', 'chat', 'note'],
        description: 'Type of memory: qa (question-answer), chat (conversation), note (general note)',
        default: 'note',
      },
      summary: {
        type: 'string',
        description: 'Optional brief summary of the content',
      },
    },
    required: ['content'],
  },
  handler: async (input: {
    content?: string;
    type?: 'qa' | 'chat' | 'note';
    summary?: string;
  }) => {
    console.error('[store_memory] Handler called with:', {
      contentLength: input.content?.length,
      type: input.type,
      hasSummary: !!input.summary,
    });

    if (!input.content || typeof input.content !== 'string') {
      console.error('[store_memory] Validation failed: content missing or not string');
      return {
        success: false,
        error: 'Content is required and must be a string',
      };
    }

    if (input.content.trim().length === 0) {
      console.error('[store_memory] Validation failed: content is empty');
      return {
        success: false,
        error: 'Content cannot be empty',
      };
    }

    try {
      console.error('[store_memory] Generating embedding...');
      const embedding = await generateEmbedding(input.content);
      console.error('[store_memory] Embedding generated, size:', embedding.length);

      const type = input.type || 'note';
      console.error('[store_memory] Inserting into database...');
      const id = await insertMemory(
        input.content,
        embedding,
        type,
        'claude-code',
        input.summary
      );
      console.error('[store_memory] Memory inserted successfully with id:', id);

      return {
        success: true,
        id,
        message: `Memory stored successfully with type: ${type}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[store_memory] Error:', message, error);
      return {
        success: false,
        error: `Failed to store memory: ${message}`,
      };
    }
  },
};
