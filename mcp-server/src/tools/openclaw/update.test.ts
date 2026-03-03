import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './update.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('openclaw_update tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: 'Updated to v2.1.0',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 30000,
    });
  });

  it('should update without force', async () => {
    const result = await tool.handler({});

    expect(result.success).toBe(true);
    expect(result.output).toContain('Updated');
    expect(mockedExecCommand).toHaveBeenCalledWith(
      'openclaw update --yes 2>&1',
      { timeout: 300000 }
    );
  });

  it('should update with force flag', async () => {
    await tool.handler({ force: true });

    expect(mockedExecCommand).toHaveBeenCalledWith(
      'openclaw update --yes --force 2>&1',
      { timeout: 300000 }
    );
  });

  it('should handle update failure', async () => {
    mockedExecCommand.mockResolvedValueOnce({
      stdout: 'Update failed: network error',
      stderr: '',
      exitCode: 1,
      truncated: false,
      durationMs: 5000,
    });

    const result = await tool.handler({});

    expect(result.success).toBe(false);
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection lost'));

    const result = await tool.handler({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to update OpenClaw');
  });
});
