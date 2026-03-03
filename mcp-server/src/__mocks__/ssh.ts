import { vi } from 'vitest';
import type { ExecResult, ExecOptions } from '../ssh.js';

export const execCommand = vi.fn().mockImplementation(async (
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> => {
  return {
    stdout: '',
    stderr: '',
    exitCode: 0,
    truncated: false,
    durationMs: 42,
  };
});

export const initSSHKeys = vi.fn().mockImplementation(async () => {
  return 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITest open-brain@container';
});

export const getPublicKey = vi.fn().mockImplementation(() => {
  return 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITest open-brain@container';
});

export const closeSSH = vi.fn().mockImplementation(async () => {
  // noop
});

export const shellEscape = vi.fn().mockImplementation((str: string) => {
  return "'" + str.replace(/'/g, "'\\''") + "'";
});
