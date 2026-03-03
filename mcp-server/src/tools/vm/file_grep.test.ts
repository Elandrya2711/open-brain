import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './file_grep.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('file_grep tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: '/app/src/index.ts:5:const server = new Server();\n/app/src/index.ts:10:server.listen(3000);\n',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 40,
    });
  });

  it('should find matches', async () => {
    const result = await tool.handler({ pattern: 'server' });

    expect(result).toEqual({
      success: true,
      pattern: 'server',
      path: '.',
      matches: [
        '/app/src/index.ts:5:const server = new Server();',
        '/app/src/index.ts:10:server.listen(3000);',
      ],
      count: 2,
      truncated: false,
    });
    expect(mockedExecCommand).toHaveBeenCalled();
  });

  it('should use custom search path', async () => {
    await tool.handler({ pattern: 'test', path: '/app/src' });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('/app/src');
  });

  it('should apply include filter', async () => {
    await tool.handler({ pattern: 'test', include: '*.ts' });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('--include=');
    expect(cmd).toContain('*.ts');
  });

  it('should apply context lines', async () => {
    await tool.handler({ pattern: 'test', context: 3 });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('-C 3');
  });

  it('should return empty array for no matches', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 1, // grep returns 1 for no matches
      truncated: false,
      durationMs: 30,
    });

    const result = await tool.handler({ pattern: 'nonexistent' });

    expect(result).toEqual({
      success: true,
      pattern: 'nonexistent',
      path: '.',
      matches: [],
      count: 0,
      truncated: false,
    });
  });

  it('should reject missing pattern', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'Pattern is required and must be a string',
    });
  });

  it('should handle grep errors (exit code > 1)', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'grep: invalid regex',
      exitCode: 2,
      truncated: false,
      durationMs: 10,
    });

    const result = await tool.handler({ pattern: '[invalid' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('grep');
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection timeout'));

    const result = await tool.handler({ pattern: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to search');
  });

  it('should exclude .git and node_modules', async () => {
    await tool.handler({ pattern: 'test' });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('--exclude-dir=.git');
    expect(cmd).toContain('--exclude-dir=node_modules');
  });

  it('should use extended regex', async () => {
    await tool.handler({ pattern: 'test' });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('-E');
  });

  it('should clamp max_results', async () => {
    await tool.handler({ pattern: 'test', max_results: 5000 });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('head -1000');
  });

  it('should clamp context lines', async () => {
    await tool.handler({ pattern: 'test', context: 50 });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('-C 20');
  });
});
