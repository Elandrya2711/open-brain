import { execCommand } from '../../ssh.js';

export const tool = {
  name: 'openclaw_status',
  description: 'Get OpenClaw service status, active agents, and running sessions',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
  handler: async () => {
    console.error('[openclaw_status] Handler called');

    try {
      const serviceResult = await execCommand(
        'systemctl --user status openclaw-gateway.service 2>&1'
      );

      const statusResult = await execCommand('openclaw status 2>&1');

      return {
        success: true,
        service_status: serviceResult.stdout.trim(),
        output: statusResult.stdout.trim(),
        exit_code: statusResult.exitCode,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[openclaw_status] Error:', message);
      return { success: false, error: `Failed to get OpenClaw status: ${message}` };
    }
  },
};
