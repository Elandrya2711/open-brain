import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './file_edit.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('file_edit tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should replace a unique string successfully', async () => {
    // Read returns file content
    mockedExecCommand.mockResolvedValueOnce({
      stdout: 'hello world',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 20,
    });
    // Write succeeds
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 20,
    });

    const result = await tool.handler({
      path: '/tmp/test.txt',
      old_string: 'hello',
      new_string: 'goodbye',
    });

    expect(result).toEqual({
      success: true,
      path: '/tmp/test.txt',
      replacements: 1,
    });
    expect(mockedExecCommand).toHaveBeenCalledTimes(2);
    // Verify write uses base64
    expect(mockedExecCommand.mock.calls[1][0]).toContain('base64');
  });

  it('should replace all occurrences with replace_all', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: 'foo bar foo baz foo',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 20,
    });
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 20,
    });

    const result = await tool.handler({
      path: '/tmp/test.txt',
      old_string: 'foo',
      new_string: 'qux',
      replace_all: true,
    });

    expect(result).toEqual({
      success: true,
      path: '/tmp/test.txt',
      replacements: 3,
    });
  });

  it('should error when old_string not found', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: 'hello world',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 20,
    });

    const result = await tool.handler({
      path: '/tmp/test.txt',
      old_string: 'nonexistent',
      new_string: 'replacement',
    });

    expect(result).toEqual({
      success: false,
      error: 'old_string not found in file',
    });
    // Should only read, not write
    expect(mockedExecCommand).toHaveBeenCalledTimes(1);
  });

  it('should error when old_string is ambiguous without replace_all', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: 'foo bar foo',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 20,
    });

    const result = await tool.handler({
      path: '/tmp/test.txt',
      old_string: 'foo',
      new_string: 'baz',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('found 2 times');
  });

  it('should error when old_string equals new_string', async () => {
    const result = await tool.handler({
      path: '/tmp/test.txt',
      old_string: 'same',
      new_string: 'same',
    });

    expect(result).toEqual({
      success: false,
      error: 'old_string and new_string must be different',
    });
  });

  it('should reject missing path', async () => {
    const result = await tool.handler({
      old_string: 'a',
      new_string: 'b',
    });

    expect(result).toEqual({
      success: false,
      error: 'Path is required and must be a string',
    });
  });

  it('should reject relative path', async () => {
    const result = await tool.handler({
      path: 'relative/path',
      old_string: 'a',
      new_string: 'b',
    });

    expect(result).toEqual({
      success: false,
      error: 'Path must be absolute (start with /)',
    });
  });

  it('should reject missing old_string', async () => {
    const result = await tool.handler({
      path: '/tmp/test.txt',
      new_string: 'b',
    });

    expect(result).toEqual({
      success: false,
      error: 'old_string is required and must be a string',
    });
  });

  it('should reject missing new_string', async () => {
    const result = await tool.handler({
      path: '/tmp/test.txt',
      old_string: 'a',
    });

    expect(result).toEqual({
      success: false,
      error: 'new_string is required and must be a string',
    });
  });

  it('should handle read failure', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'No such file or directory',
      exitCode: 1,
      truncated: false,
      durationMs: 10,
    });

    const result = await tool.handler({
      path: '/nonexistent/file.txt',
      old_string: 'a',
      new_string: 'b',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No such file or directory');
  });

  it('should handle write failure', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: 'hello world',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 20,
    });
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'Permission denied',
      exitCode: 1,
      truncated: false,
      durationMs: 10,
    });

    const result = await tool.handler({
      path: '/tmp/test.txt',
      old_string: 'hello',
      new_string: 'goodbye',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection timeout'));

    const result = await tool.handler({
      path: '/tmp/test.txt',
      old_string: 'a',
      new_string: 'b',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to edit file');
  });
});
