import { execCommand } from '../../ssh.js';

export const tool = {
  name: 'openclaw_restart',
  description: 'Restart the OpenClaw gateway service',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
  handler: async () => {
    console.error('[openclaw_restart] Handler called');

    try {
      const restartResult = await execCommand(
        'systemctl --user restart openclaw-gateway.service',
        { timeout: 60000 }
      );

      if (restartResult.exitCode !== 0) {
        return {
          success: false,
          error: restartResult.stderr.trim() || `Restart failed (exit code ${restartResult.exitCode})`,
        };
      }

      // Check if service is active after restart
      const checkResult = await execCommand(
        'systemctl --user is-active openclaw-gateway.service 2>&1'
      );

      return {
        success: true,
        status: checkResult.stdout.trim(),
        message: 'OpenClaw gateway restarted',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[openclaw_restart] Error:', message);
      return { success: false, error: `Failed to restart OpenClaw: ${message}` };
    }
  },
};
