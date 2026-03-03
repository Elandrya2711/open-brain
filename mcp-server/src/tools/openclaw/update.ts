import { execCommand } from '../../ssh.js';

export const tool = {
  name: 'openclaw_update',
  description: 'Update OpenClaw to the latest version',
  inputSchema: {
    type: 'object' as const,
    properties: {
      force: {
        type: 'boolean',
        description: 'Force update even if already on latest version',
      },
    },
  },
  handler: async (input: { force?: boolean }) => {
    console.error('[openclaw_update] Handler called with:', { force: input.force });

    try {
      const command = input.force
        ? 'openclaw update --yes --force 2>&1'
        : 'openclaw update --yes 2>&1';

      const result = await execCommand(command, { timeout: 300000 });

      return {
        success: result.exitCode === 0,
        output: result.stdout.trim(),
        exit_code: result.exitCode,
        ...(result.exitCode !== 0 && { error: result.stderr.trim() || result.stdout.trim() }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[openclaw_update] Error:', message);
      return { success: false, error: `Failed to update OpenClaw: ${message}` };
    }
  },
};
