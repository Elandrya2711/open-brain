import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './cron_run.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('openclaw_cron_run tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: 'Job completed successfully',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 5000,
    });
  });

  it('should run cron job successfully', async () => {
    const result = await tool.handler({ job_id: 'daily-backup' });

    expect(result.success).toBe(true);
    expect(result.job_id).toBe('daily-backup');
    expect(result.output).toContain('completed');
    expect(mockedExecCommand).toHaveBeenCalledWith(
      'openclaw cron run daily-backup 2>&1',
      { timeout: 120000 }
    );
  });

  it('should reject missing job_id', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'Job ID is required and must be a string',
    });
  });

  it('should reject invalid job_id', async () => {
    const result = await tool.handler({ job_id: 'job; rm -rf /' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid job ID');
  });

  it('should accept valid job_id with hyphens and underscores', async () => {
    await tool.handler({ job_id: 'my-job_123' });
    expect(mockedExecCommand).toHaveBeenCalled();
  });

  it('should handle job failure', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: 'Error: job failed',
      stderr: '',
      exitCode: 1,
      truncated: false,
      durationMs: 100,
    });

    const result = await tool.handler({ job_id: 'failing-job' });

    expect(result.success).toBe(false);
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Timeout'));

    const result = await tool.handler({ job_id: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to run cron job');
  });
});
