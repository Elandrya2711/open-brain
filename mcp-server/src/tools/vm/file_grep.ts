import { execCommand, shellEscape } from '../../ssh.js';

export const tool = {
  name: 'file_grep',
  description: 'Search file contents on the VM using regex patterns. Returns matching lines with file paths and line numbers.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern to search for',
      },
      path: {
        type: 'string',
        description: 'File or directory to search in (default: current directory)',
      },
      include: {
        type: 'string',
        description: 'Glob filter for files (e.g. "*.ts", "*.json")',
      },
      context: {
        type: 'number',
        description: 'Number of context lines before and after each match (default: 0)',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of matching lines to return (default: 100)',
      },
    },
    required: ['pattern'],
  },
  handler: async (input: {
    pattern?: string;
    path?: string;
    include?: string;
    context?: number;
    max_results?: number;
  }) => {
    console.error('[file_grep] Handler called with:', {
      pattern: input.pattern,
      path: input.path,
      include: input.include,
      context: input.context,
      max_results: input.max_results,
    });

    if (!input.pattern || typeof input.pattern !== 'string') {
      return { success: false, error: 'Pattern is required and must be a string' };
    }

    const searchPath = input.path && typeof input.path === 'string' ? input.path : '.';
    const maxResults = Math.min(Math.max(input.max_results || 100, 1), 1000);
    const contextLines = Math.min(Math.max(input.context || 0, 0), 20);

    try {
      const parts: string[] = ['grep', '-rn', '-E'];

      // Context lines
      if (contextLines > 0) {
        parts.push(`-C ${contextLines}`);
      }

      // File filter
      if (input.include && typeof input.include === 'string') {
        parts.push(`--include=${shellEscape(input.include)}`);
      }

      // Exclude common noise
      parts.push('--exclude-dir=.git', '--exclude-dir=node_modules');

      // Pattern and path
      parts.push(shellEscape(input.pattern), shellEscape(searchPath));

      // Limit output
      parts.push(`| head -${maxResults}`);

      const cmd = parts.join(' ');
      console.error('[file_grep] Running:', cmd);

      const result = await execCommand(cmd, { maxOutput: 524288 });

      // grep returns exit code 1 for no matches — that's not an error
      if (result.exitCode !== 0 && result.exitCode !== 1) {
        return {
          success: false,
          error: result.stderr.trim() || `grep failed (exit code ${result.exitCode})`,
        };
      }

      const lines = result.stdout.trim()
        ? result.stdout.trim().split('\n')
        : [];

      return {
        success: true,
        pattern: input.pattern,
        path: searchPath,
        matches: lines,
        count: lines.length,
        truncated: lines.length >= maxResults,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[file_grep] Error:', message);
      return { success: false, error: `Failed to search: ${message}` };
    }
  },
};
