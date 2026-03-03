import { execCommand, shellEscape } from '../../ssh.js';

function globToFind(pattern: string, basePath: string): string {
  const parts: string[] = ['find', shellEscape(basePath)];

  // Exclude common noise directories
  parts.push('\\(', '-name', '.git', '-o', '-name', 'node_modules', '\\)', '-prune', '-o');

  // Split pattern into directory and filename parts
  // e.g. "src/**/*.ts" → dir prefix "src", recursive, name "*.ts"
  const segments = pattern.split('/');
  const namePattern = segments[segments.length - 1];
  const dirSegments = segments.slice(0, -1);

  // Build path constraint from directory segments (before the filename)
  let pathPattern = '';
  for (const seg of dirSegments) {
    if (seg === '**') {
      pathPattern += '*/';
    } else {
      pathPattern += seg + '/';
    }
  }

  // If there's a directory path constraint, use -path
  if (pathPattern) {
    // Construct full path pattern for find's -path
    const fullPathPattern = basePath.replace(/\/$/, '') + '/' + pathPattern + namePattern;
    parts.push('-type', 'f', '-path', shellEscape(fullPathPattern), '-print');
  } else {
    // Simple name-only pattern
    parts.push('-type', 'f', '-name', shellEscape(namePattern), '-print');
  }

  // Sort by modification time (newest first), limit results
  return parts.join(' ') + ' 2>/dev/null | head -200';
}

export const tool = {
  name: 'file_glob',
  description: 'Search for files matching a glob pattern on the VM. Returns matching file paths sorted by modification time.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files (e.g. "**/*.ts", "src/**/*.json")',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: current directory)',
      },
    },
    required: ['pattern'],
  },
  handler: async (input: { pattern?: string; path?: string }) => {
    console.error('[file_glob] Handler called with:', {
      pattern: input.pattern,
      path: input.path,
    });

    if (!input.pattern || typeof input.pattern !== 'string') {
      return { success: false, error: 'Pattern is required and must be a string' };
    }

    const basePath = input.path && typeof input.path === 'string' ? input.path : '.';

    try {
      const cmd = globToFind(input.pattern, basePath);
      console.error('[file_glob] Running:', cmd);

      const result = await execCommand(cmd, { maxOutput: 524288 });

      // find returns exit code 0 even with no matches (we redirect stderr)
      const files = result.stdout.trim()
        ? result.stdout.trim().split('\n').filter(Boolean)
        : [];

      return {
        success: true,
        pattern: input.pattern,
        path: basePath,
        files,
        count: files.length,
        truncated: files.length >= 200,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[file_glob] Error:', message);
      return { success: false, error: `Failed to search files: ${message}` };
    }
  },
};
