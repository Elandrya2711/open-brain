import { syncSoul } from '../../db.js';

export const tool = {
  name: 'sync_soul',
  description:
    'Update the soul — archives the current active version and creates a new one. ' +
    'The previous version is preserved with a valid_until timestamp for historical reference.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string',
        description: 'The new soul content (full replacement, not a diff).',
      },
    },
    required: ['content'],
  },
  handler: async (input: { content?: string }) => {
    if (!input.content || typeof input.content !== 'string') {
      return {
        success: false,
        error: 'Content is required and must be a string.',
      };
    }

    if (input.content.trim().length === 0) {
      return {
        success: false,
        error: 'Content cannot be empty.',
      };
    }

    try {
      const version = await syncSoul(input.content);

      return {
        success: true,
        version: {
          id: version.id,
          valid_from: version.valid_from,
        },
        message: 'Soul updated successfully.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to sync soul: ${message}`,
      };
    }
  },
};
