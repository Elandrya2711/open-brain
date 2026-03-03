import { execCommand } from '../../ssh.js';

export const tool = {
  name: 'shell_exec',
  description: 'Execute a shell command on the VM via SSH',
  inputSchema: {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000, max: 300000)',
      },
    },
    required: ['command'],
  },
  handler: async (input: { command?: string; timeout?: number }) => {
    console.error('[shell_exec] Handler called with:', {
      command: input.command,
      timeout: input.timeout,
    });

    if (!input.command || typeof input.command !== 'string') {
      return { success: false, error: 'Command is required and must be a string' };
    }

    if (input.command.trim().length === 0) {
      return { success: false, error: 'Command cannot be empty' };
    }

    const timeout = Math.min(Math.max(input.timeout || 30000, 1000), 300000);

    try {
      const result = await execCommand(input.command, { timeout });
      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exitCode,
        truncated: result.truncated,
        duration_ms: result.durationMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[shell_exec] Error:', message);
      return { success: false, error: `Failed to execute command: ${message}` };
    }
  },
};
