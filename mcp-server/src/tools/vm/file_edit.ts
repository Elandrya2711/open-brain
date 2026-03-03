import { execCommand, shellEscape } from '../../ssh.js';

export const tool = {
  name: 'file_edit',
  description: 'Perform exact string replacements in files on the VM. Finds old_string and replaces it with new_string.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Absolute file path to edit',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to find and replace',
      },
      new_string: {
        type: 'string',
        description: 'The replacement text',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences (default: false)',
        default: false,
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  handler: async (input: {
    path?: string;
    old_string?: string;
    new_string?: string;
    replace_all?: boolean;
  }) => {
    console.error('[file_edit] Handler called with:', {
      path: input.path,
      old_string_length: input.old_string?.length,
      new_string_length: input.new_string?.length,
      replace_all: input.replace_all,
    });

    if (!input.path || typeof input.path !== 'string') {
      return { success: false, error: 'Path is required and must be a string' };
    }

    if (!input.path.startsWith('/')) {
      return { success: false, error: 'Path must be absolute (start with /)' };
    }

    if (input.old_string === undefined || input.old_string === null || typeof input.old_string !== 'string') {
      return { success: false, error: 'old_string is required and must be a string' };
    }

    if (input.new_string === undefined || input.new_string === null || typeof input.new_string !== 'string') {
      return { success: false, error: 'new_string is required and must be a string' };
    }

    if (input.old_string === input.new_string) {
      return { success: false, error: 'old_string and new_string must be different' };
    }

    const replaceAll = input.replace_all === true;

    try {
      // Step 1: Read the file
      const readResult = await execCommand(`cat ${shellEscape(input.path)}`, { maxOutput: 1048576 });

      if (readResult.exitCode !== 0) {
        return {
          success: false,
          error: readResult.stderr.trim() || `Failed to read file (exit code ${readResult.exitCode})`,
        };
      }

      const content = readResult.stdout;

      // Step 2: Check occurrences
      const occurrences = content.split(input.old_string).length - 1;

      if (occurrences === 0) {
        return { success: false, error: 'old_string not found in file' };
      }

      if (!replaceAll && occurrences > 1) {
        return {
          success: false,
          error: `old_string found ${occurrences} times — must be unique (or use replace_all: true)`,
        };
      }

      // Step 3: Perform replacement
      let newContent: string;
      if (replaceAll) {
        newContent = content.split(input.old_string).join(input.new_string);
      } else {
        const index = content.indexOf(input.old_string);
        newContent = content.slice(0, index) + input.new_string + content.slice(index + input.old_string.length);
      }

      // Step 4: Write back via base64
      const b64 = Buffer.from(newContent, 'utf-8').toString('base64');
      const writeResult = await execCommand(
        `printf '%s' ${shellEscape(b64)} | base64 -d > ${shellEscape(input.path)}`
      );

      if (writeResult.exitCode !== 0) {
        return {
          success: false,
          error: writeResult.stderr.trim() || `Failed to write file (exit code ${writeResult.exitCode})`,
        };
      }

      return {
        success: true,
        path: input.path,
        replacements: replaceAll ? occurrences : 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[file_edit] Error:', message);
      return { success: false, error: `Failed to edit file: ${message}` };
    }
  },
};
