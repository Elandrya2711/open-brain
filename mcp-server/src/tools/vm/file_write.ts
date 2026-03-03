import { execCommand, shellEscape } from '../../ssh.js';

export const tool = {
  name: 'file_write',
  description: 'Write content to a file on the VM',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Absolute file path to write',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
  handler: async (input: { path?: string; content?: string }) => {
    console.error('[file_write] Handler called with:', {
      path: input.path,
      contentLength: input.content?.length,
    });

    if (!input.path || typeof input.path !== 'string') {
      return { success: false, error: 'Path is required and must be a string' };
    }

    if (!input.path.startsWith('/')) {
      return { success: false, error: 'Path must be absolute (start with /)' };
    }

    if (input.content === undefined || input.content === null || typeof input.content !== 'string') {
      return { success: false, error: 'Content is required and must be a string' };
    }

    try {
      // Use base64 encoding for safe transfer of arbitrary content
      const b64 = Buffer.from(input.content, 'utf-8').toString('base64');
      const result = await execCommand(
        `printf '%s' ${shellEscape(b64)} | base64 -d > ${shellEscape(input.path)}`
      );

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr.trim() || `Failed to write file (exit code ${result.exitCode})`,
        };
      }

      return {
        success: true,
        path: input.path,
        bytes_written: Buffer.byteLength(input.content, 'utf-8'),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[file_write] Error:', message);
      return { success: false, error: `Failed to write file: ${message}` };
    }
  },
};
