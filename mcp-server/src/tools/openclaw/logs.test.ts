import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './logs.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('openclaw_logs tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: 'line1\nline2\nline3\n',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 30,
    });
  });

  it('should return log lines with default count', async () => {
    const result = await tool.handler({});

    expect(result.success).toBe(true);
    expect(result.lines).toBe(3);
    expect(result.content).toContain('line1');
    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('tail -n 50');
  });

  it('should accept custom line count', async () => {
    await tool.handler({ lines: 200 });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('tail -n 200');
  });

  it('should clamp lines to max 1000', async () => {
    await tool.handler({ lines: 5000 });

    const cmd = mockedExecCommand.mock.calls[0][0];
    expect(cmd).toContain('tail -n 1000');
  });

  it('should handle missing log file', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: 'No such file or directory',
      stderr: '',
      exitCode: 1,
      truncated: false,
      durationMs: 10,
    });

    const result = await tool.handler({});

    expect(result.success).toBe(false);
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection lost'));

    const result = await tool.handler({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to get OpenClaw logs');
  });
});
