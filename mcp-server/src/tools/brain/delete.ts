import { deleteMemory } from '../../db.js';

export const tool = {
  name: 'delete_memory',
  description: 'Delete a memory by ID',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'The memory ID to delete',
      },
    },
    required: ['id'],
  },
  handler: async (input: { id?: string }) => {
    if (!input.id || typeof input.id !== 'string') {
      return {
        success: false,
        error: 'ID is required and must be a string',
      };
    }

    try {
      const deleted = await deleteMemory(input.id);

      if (!deleted) {
        return {
          success: false,
          error: 'Memory not found',
        };
      }

      return {
        success: true,
        message: `Memory ${input.id} deleted successfully`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to delete memory: ${message}`,
      };
    }
  },
};
