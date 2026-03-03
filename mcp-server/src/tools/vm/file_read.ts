import { execCommand, shellEscape } from '../../ssh.js';

export const tool = {
  name: 'file_read',
  description: 'Read file contents from the VM',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Absolute file path to read',
      },
    },
    required: ['path'],
  },
  handler: async (input: { path?: string }) => {
    console.error('[file_read] Handler called with:', { path: input.path });

    if (!input.path || typeof input.path !== 'string') {
      return { success: false, error: 'Path is required and must be a string' };
    }

    if (!input.path.startsWith('/')) {
      return { success: false, error: 'Path must be absolute (start with /)' };
    }

    try {
      const result = await execCommand(`cat ${shellEscape(input.path)}`);

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr.trim() || `Failed to read file (exit code ${result.exitCode})`,
        };
      }

      return {
        success: true,
        path: input.path,
        content: result.stdout,
        size: result.stdout.length,
        truncated: result.truncated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[file_read] Error:', message);
      return { success: false, error: `Failed to read file: ${message}` };
    }
  },
};
