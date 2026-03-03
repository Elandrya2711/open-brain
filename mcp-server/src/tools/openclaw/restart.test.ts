import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './restart.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('openclaw_restart tool', () => {
  beforeEach(() => {
    mockedExecCommand.mockReset();
  });

  it('should restart and check status', async () => {
    mockedExecCommand
      .mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
        truncated: false,
        durationMs: 2000,
      })
      .mockResolvedValueOnce({
        stdout: 'active',
        stderr: '',
        exitCode: 0,
        truncated: false,
        durationMs: 50,
      });

    const result = await tool.handler();

    expect(result.success).toBe(true);
    expect(result.status).toBe('active');
    expect(result.message).toContain('restarted');
    expect(mockedExecCommand).toHaveBeenCalledTimes(2);
  });

  it('should handle restart failure', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'Failed to restart',
      exitCode: 1,
      truncated: false,
      durationMs: 100,
    });

    const result = await tool.handler();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to restart');
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Timeout'));

    const result = await tool.handler();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to restart OpenClaw');
  });
});
