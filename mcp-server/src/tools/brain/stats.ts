import { getStats } from '../../db.js';

export const tool = {
  name: 'get_stats',
  description: 'Get statistics about stored memories',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
  handler: async () => {
    try {
      const stats = await getStats();

      return {
        success: true,
        total: stats.total,
        byType: stats.byType,
        dateRange: {
          oldest: stats.oldestDate,
          newest: stats.newestDate,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to get stats: ${message}`,
      };
    }
  },
};
