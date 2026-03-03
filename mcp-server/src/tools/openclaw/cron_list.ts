import { execCommand } from '../../ssh.js';

export const tool = {
  name: 'openclaw_cron_list',
  description: 'List all OpenClaw cron jobs with status and next trigger time',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
  handler: async () => {
    console.error('[openclaw_cron_list] Handler called');

    try {
      const result = await execCommand('openclaw cron list 2>&1');

      return {
        success: true,
        output: result.stdout.trim(),
        exit_code: result.exitCode,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[openclaw_cron_list] Error:', message);
      return { success: false, error: `Failed to list cron jobs: ${message}` };
    }
  },
};
