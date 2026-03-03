import { execCommand } from '../../ssh.js';

export const tool = {
  name: 'openclaw_logs',
  description: 'Get recent OpenClaw log lines',
  inputSchema: {
    type: 'object' as const,
    properties: {
      lines: {
        type: 'number',
        description: 'Number of log lines to retrieve (default: 50, max: 1000)',
      },
    },
  },
  handler: async (input: { lines?: number }) => {
    const lines = Math.min(Math.max(input.lines || 50, 1), 1000);
    console.error('[openclaw_logs] Handler called with:', { lines });

    try {
      const result = await execCommand(
        `tail -n ${lines} /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log 2>&1`
      );

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stdout.trim() || result.stderr.trim() || 'Log file not found or not readable',
        };
      }

      return {
        success: true,
        lines: result.stdout.split('\n').filter(l => l.length > 0).length,
        content: result.stdout,
        truncated: result.truncated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[openclaw_logs] Error:', message);
      return { success: false, error: `Failed to get OpenClaw logs: ${message}` };
    }
  },
};
