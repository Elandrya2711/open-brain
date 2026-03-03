import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './file_glob.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('file_glob tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: '/app/src/index.ts\n/app/src/utils.ts\n',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 50,
    });
  });

  it('should find files matching pattern', async () => {
    const result = await tool.handler({ pattern: '*.ts' });

    expect(result).toEqual({
      success: true,
      pattern: '*.ts',
      path: '.',
      files: ['/app/src/index.ts', '/app/src/utils.ts'],
      count: 2,
      truncated: false,
    });
    expect(mockedExecCommand).toHaveBeenCalled();
  });

  it('should use custom search path', async () => {
    await tool.handler({ pattern: '*.ts', path: '/app/src' });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('/app/src');
  });

  it('should handle directory patterns like src/**/*.ts', async () => {
    await tool.handler({ pattern: 'src/**/*.ts' });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('-path');
    expect(cmd).toContain('*.ts');
  });

  it('should return empty array for no matches', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 30,
    });

    const result = await tool.handler({ pattern: '*.xyz' });

    expect(result).toEqual({
      success: true,
      pattern: '*.xyz',
      path: '.',
      files: [],
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

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection lost'));

    const result = await tool.handler({ pattern: '*.ts' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to search files');
  });

  it('should exclude .git and node_modules', async () => {
    await tool.handler({ pattern: '*.ts' });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('.git');
    expect(cmd).toContain('node_modules');
    expect(cmd).toContain('-prune');
  });

  it('should limit results to 200', async () => {
    await tool.handler({ pattern: '*.ts' });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('head -200');
  });
});
