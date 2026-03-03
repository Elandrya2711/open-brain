import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './status.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('openclaw_status tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: 'active (running)',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 50,
    });
  });

  it('should return service status and openclaw output', async () => {
    const result = await tool.handler();

    expect(result.success).toBe(true);
    expect(result.service_status).toBeDefined();
    expect(result.output).toBeDefined();
    expect(mockedExecCommand).toHaveBeenCalledTimes(2);
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await tool.handler();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to get OpenClaw status');
  });
});
