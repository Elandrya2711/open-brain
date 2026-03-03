import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './file_write.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('file_write tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 25,
    });
  });

  it('should write file successfully', async () => {
    const result = await tool.handler({
      path: '/tmp/test.txt',
      content: 'hello world',
    });

    expect(result).toEqual({
      success: true,
      path: '/tmp/test.txt',
      bytes_written: 11,
    });
    expect(mockedExecCommand).toHaveBeenCalled();
    // Verify base64 is used in the command
    const callArgs = mockedExecCommand.mock.calls[0][0];
    expect(callArgs).toContain('base64');
  });

  it('should reject missing path', async () => {
    const result = await tool.handler({ content: 'test' });

    expect(result).toEqual({
      success: false,
      error: 'Path is required and must be a string',
    });
  });

  it('should reject relative path', async () => {
    const result = await tool.handler({ path: 'relative', content: 'test' });

    expect(result).toEqual({
      success: false,
      error: 'Path must be absolute (start with /)',
    });
  });

  it('should reject missing content', async () => {
    const result = await tool.handler({ path: '/tmp/test.txt' });

    expect(result).toEqual({
      success: false,
      error: 'Content is required and must be a string',
    });
  });

  it('should handle write failure', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'Permission denied',
      exitCode: 1,
      truncated: false,
      durationMs: 10,
    });

    const result = await tool.handler({
      path: '/root/test.txt',
      content: 'test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection timeout'));

    const result = await tool.handler({
      path: '/tmp/test.txt',
      content: 'test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to write file');
  });
});
