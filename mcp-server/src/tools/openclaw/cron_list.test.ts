import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './cron_list.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('openclaw_cron_list tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: 'job1  daily  active  2024-01-01\njob2  hourly  active  2024-01-01',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 40,
    });
  });

  it('should list cron jobs', async () => {
    const result = await tool.handler();

    expect(result.success).toBe(true);
    expect(result.output).toContain('job1');
    expect(result.output).toContain('job2');
    expect(mockedExecCommand).toHaveBeenCalledWith('openclaw cron list 2>&1');
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await tool.handler();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to list cron jobs');
  });
});
