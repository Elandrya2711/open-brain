import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './shell_exec.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('shell_exec tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: 'hello\n',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 42,
    });
  });

  it('should execute command successfully', async () => {
    const result = await tool.handler({ command: 'echo hello' });

    expect(result).toEqual({
      success: true,
      stdout: 'hello\n',
      stderr: '',
      exit_code: 0,
      truncated: false,
      duration_ms: 42,
    });
    expect(mockedExecCommand).toHaveBeenCalledWith('echo hello', { timeout: 30000 });
  });

  it('should pass custom timeout', async () => {
    await tool.handler({ command: 'sleep 5', timeout: 60000 });

    expect(mockedExecCommand).toHaveBeenCalledWith('sleep 5', { timeout: 60000 });
  });

  it('should clamp timeout to max 300000', async () => {
    await tool.handler({ command: 'test', timeout: 999999 });

    expect(mockedExecCommand).toHaveBeenCalledWith('test', { timeout: 300000 });
  });

  it('should reject missing command', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'Command is required and must be a string',
    });
    expect(mockedExecCommand).not.toHaveBeenCalled();
  });

  it('should reject empty command', async () => {
    const result = await tool.handler({ command: '   ' });

    expect(result).toEqual({
      success: false,
      error: 'Command cannot be empty',
    });
    expect(mockedExecCommand).not.toHaveBeenCalled();
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await tool.handler({ command: 'echo hello' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to execute command');
  });

  it('should pass through non-zero exit codes', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'command not found',
      exitCode: 127,
      truncated: false,
      durationMs: 10,
    });

    const result = await tool.handler({ command: 'nonexistent' });

    expect(result.success).toBe(true);
    expect(result.exit_code).toBe(127);
    expect(result.stderr).toBe('command not found');
  });
});
