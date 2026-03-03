import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './file_read.js';
import { execCommand, shellEscape } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('file_read tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: 'file contents here',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 30,
    });
  });

  it('should read file successfully', async () => {
    const result = await tool.handler({ path: '/etc/hostname' });

    expect(result).toEqual({
      success: true,
      path: '/etc/hostname',
      content: 'file contents here',
      size: 18,
      truncated: false,
    });
    expect(mockedExecCommand).toHaveBeenCalled();
  });

  it('should reject missing path', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'Path is required and must be a string',
    });
  });

  it('should reject relative path', async () => {
    const result = await tool.handler({ path: 'relative/path' });

    expect(result).toEqual({
      success: false,
      error: 'Path must be absolute (start with /)',
    });
  });

  it('should handle file not found', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'cat: /no/such/file: No such file or directory',
      exitCode: 1,
      truncated: false,
      durationMs: 10,
    });

    const result = await tool.handler({ path: '/no/such/file' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No such file');
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection lost'));

    const result = await tool.handler({ path: '/etc/hostname' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to read file');
  });
});
