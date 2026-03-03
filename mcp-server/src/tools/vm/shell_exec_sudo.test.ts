import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './shell_exec_sudo.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('shell_exec_sudo tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 42,
    });
  });

  it('should execute with sudo flag', async () => {
    await tool.handler({ command: 'systemctl restart nginx' });

    expect(mockedExecCommand).toHaveBeenCalledWith(
      'systemctl restart nginx',
      { timeout: 30000, sudo: true }
    );
  });

  it('should reject missing command', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'Command is required and must be a string',
    });
  });

  it('should reject empty command', async () => {
    const result = await tool.handler({ command: '' });

    expect(result).toEqual({
      success: false,
      error: 'Command is required and must be a string',
    });
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Permission denied'));

    const result = await tool.handler({ command: 'reboot' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to execute command');
  });
});
