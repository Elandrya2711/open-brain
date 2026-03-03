import { getActiveSoul } from '../../db.js';

export const tool = {
  name: 'get_soul',
  description:
    'Retrieve the soul — the core identity, values, and behavioral guidelines that shape how the AI operates. ' +
    'Returns the currently active soul version. Optionally pass an ISO-8601 timestamp via the "at" parameter ' +
    'to retrieve the soul version that was active at that point in time.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      at: {
        type: 'string',
        description:
          'Optional ISO-8601 timestamp (e.g. "2025-06-15T12:00:00Z"). ' +
          'If provided, returns the soul version that was active at that point in time.',
      },
    },
  },
  handler: async (input: { at?: string }) => {
    try {
      if (input.at) {
        const parsed = Date.parse(input.at);
        if (isNaN(parsed)) {
          return {
            success: false,
            error: `Invalid timestamp: "${input.at}". Please provide a valid ISO-8601 timestamp.`,
          };
        }
      }

      const soul = await getActiveSoul(input.at);

      if (!soul) {
        return {
          success: true,
          found: false,
          message: input.at
            ? `No soul version found for timestamp ${input.at}.`
            : 'No active soul version found. Use sync_soul to create one.',
        };
      }

      return {
        success: true,
        found: true,
        soul,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to retrieve soul: ${message}`,
      };
    }
  },
};
