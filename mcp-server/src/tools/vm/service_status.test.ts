import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../ssh.js');

import { tool } from './service_status.js';
import { execCommand } from '../../ssh.js';

const mockedExecCommand = vi.mocked(execCommand);

describe('service_status tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: 'nginx.service - A high performance web server\n   Active: active (running)\n---JOURNAL---\nMar 03 12:00:00 vm nginx[1234]: started',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 50,
    });
  });

  it('should return service status and logs', async () => {
    const result = await tool.handler({ name: 'nginx' });

    expect(result.success).toBe(true);
    expect(result.service).toBe('nginx');
    expect(result.status).toContain('nginx.service');
    expect(result.logs).toContain('started');
  });

  it('should reject missing name', async () => {
    const result = await tool.handler({});

    expect(result).toEqual({
      success: false,
      error: 'Service name is required and must be a string',
    });
  });

  it('should reject invalid service name', async () => {
    const result = await tool.handler({ name: 'nginx; rm -rf /' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid service name');
  });

  it('should accept valid service names with special chars', async () => {
    await tool.handler({ name: 'openclaw-gateway.service' });
    expect(mockedExecCommand).toHaveBeenCalled();

    vi.clearAllMocks();
    mockedExecCommand.mockResolvedValue({
      stdout: 'test\n---JOURNAL---\nlog',
      stderr: '',
      exitCode: 0,
      truncated: false,
      durationMs: 10,
    });

    await tool.handler({ name: 'user@1000.service' });
    expect(mockedExecCommand).toHaveBeenCalled();
  });

  it('should handle SSH errors', async () => {
    mockedExecCommand.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await tool.handler({ name: 'nginx' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to get service status');
  });
});
