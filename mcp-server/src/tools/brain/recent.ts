import { getRecentMemories } from '../../db.js';

export const tool = {
  name: 'list_recent',
  description: 'List recently stored memories',
  inputSchema: {
    type: 'object' as const,
    properties: {
      days: {
        type: 'number',
        description: 'Number of days to look back (default: 7)',
        default: 7,
      },
    },
  },
  handler: async (input: { days?: number }) => {
    try {
      const days = Math.max(input.days || 7, 1);
      const memories = await getRecentMemories(days);

      return {
        success: true,
        count: memories.length,
        days,
        memories: memories.map(m => ({
          id: m.id,
          content: m.content.substring(0, 200),
          summary: m.summary,
          type: m.type,
          createdAt: m.created_at,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to list recent memories: ${message}`,
      };
    }
  },
};
