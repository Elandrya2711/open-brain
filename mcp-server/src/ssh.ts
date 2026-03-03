import { Client } from 'ssh2';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// --- Configuration ---
const SSH_HOST = process.env.VM_SSH_HOST;
const SSH_PORT = parseInt(process.env.VM_SSH_PORT || '22', 10);
const SSH_USER = process.env.VM_SSH_USER || 'mako';
const SSH_KEY_ENV = process.env.VM_SSH_KEY?.replace(/\\n/g, '\n');

const SSH_DATA_DIR = process.env.SSH_DATA_DIR || '/app/data/ssh';
const PRIVATE_KEY_PATH = path.join(SSH_DATA_DIR, 'id_ed25519');
const PUBLIC_KEY_PATH = path.join(SSH_DATA_DIR, 'id_ed25519.pub');

console.error('[ssh] Configuration:', {
  host: SSH_HOST || 'NOT SET',
  port: SSH_PORT,
  user: SSH_USER,
  hasEnvKey: !!SSH_KEY_ENV,
  dataDir: SSH_DATA_DIR,
});

// --- Types ---
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
  durationMs: number;
}

export interface ExecOptions {
  timeout?: number;
  maxOutput?: number;
  sudo?: boolean;
}

// --- Key Management ---
let cachedPublicKey: string | null = null;

export async function initSSHKeys(): Promise<string> {
  // If env var key is set, skip auto-generation
  if (SSH_KEY_ENV) {
    console.error('[ssh] Using SSH key from VM_SSH_KEY environment variable');
    // Try to derive public key info for display, but don't fail if we can't
    cachedPublicKey = '(provided via VM_SSH_KEY env var - public key not available for display)';
    return cachedPublicKey;
  }

  // Check if key already exists
  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    console.error('[ssh] Existing SSH keypair found at', SSH_DATA_DIR);
    cachedPublicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8').trim();
    console.error('[ssh] Public Key:', cachedPublicKey);
    return cachedPublicKey;
  }

  // Generate new Ed25519 keypair
  console.error('[ssh] Generating new Ed25519 SSH keypair...');
  fs.mkdirSync(SSH_DATA_DIR, { recursive: true });

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Convert PEM public key to OpenSSH format for authorized_keys
  const pubKeyObj = crypto.createPublicKey(publicKey);
  const sshPublicKey = pubKeyObj.export({ type: 'spki', format: 'der' });

  // Build OpenSSH format: ssh-ed25519 <base64-key> open-brain@container
  const keyData = sshPublicKey.subarray(12); // Skip DER header for Ed25519
  const opensshKey = `ssh-ed25519 ${Buffer.concat([
    Buffer.from([0, 0, 0, 11]), // length of "ssh-ed25519"
    Buffer.from('ssh-ed25519'),
    Buffer.from([0, 0, 0, 32]), // length of ed25519 key (32 bytes)
    keyData,
  ]).toString('base64')} open-brain@container`;

  // Write keys to disk
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, opensshKey, { mode: 0o644 });

  cachedPublicKey = opensshKey;
  console.error('[ssh] SSH keypair generated successfully');
  console.error('[ssh] Public Key:', cachedPublicKey);
  console.error('[ssh] Add this key to ~/.ssh/authorized_keys on the target VM');

  return cachedPublicKey;
}

export function getPublicKey(): string | null {
  return cachedPublicKey;
}

// --- Connection Management ---
let client: Client | null = null;
let connecting: Promise<Client> | null = null;

/**
 * Normalize a private key to PKCS#8 PEM format.
 * Handles OpenSSH (`BEGIN OPENSSH PRIVATE KEY`), PKCS#1 (`BEGIN RSA PRIVATE KEY`),
 * and PKCS#8 (`BEGIN PRIVATE KEY`) input formats.
 */
function normalizePrivateKey(rawKey: string): string {
  try {
    const keyObject = crypto.createPrivateKey(rawKey);
    const normalized = keyObject.export({ type: 'pkcs8', format: 'pem' }) as string;
    console.error('[ssh] Private key normalized to PKCS#8 PEM format successfully');
    return normalized;
  } catch (err) {
    console.error('[ssh] Warning: Could not normalize private key format:', (err as Error).message);
    console.error('[ssh] Passing key to ssh2 as-is (may fail if format is unsupported)');
    return rawKey;
  }
}

function getPrivateKey(): string {
  let rawKey: string;

  if (SSH_KEY_ENV) {
    rawKey = SSH_KEY_ENV;
  } else if (fs.existsSync(PRIVATE_KEY_PATH)) {
    rawKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
  } else {
    throw new Error('No SSH private key available. Run initSSHKeys() first or set VM_SSH_KEY env var.');
  }

  return normalizePrivateKey(rawKey);
}

function createConnection(): Promise<Client> {
  if (!SSH_HOST) {
    return Promise.reject(new Error('VM_SSH_HOST is not configured'));
  }

  const privateKey = getPrivateKey();

  return new Promise<Client>((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      console.error('[ssh] Connection established to', SSH_HOST);
      client = conn;
      connecting = null;
      resolve(conn);
    });

    conn.on('error', (err) => {
      console.error('[ssh] Connection error:', err.message);
      client = null;
      connecting = null;
      reject(new Error(`SSH connection failed: ${err.message}`));
    });

    conn.on('close', () => {
      console.error('[ssh] Connection closed');
      client = null;
      connecting = null;
    });

    conn.connect({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      privateKey,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      readyTimeout: 10000,
    });
  });
}

async function getConnection(): Promise<Client> {
  if (client) {
    return client;
  }

  if (connecting) {
    return connecting;
  }

  connecting = createConnection();
  return connecting;
}

// --- Command Execution ---
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_OUTPUT = 102400; // 100KB

export async function execCommand(command: string, options: ExecOptions = {}): Promise<ExecResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const maxOutput = options.maxOutput ?? DEFAULT_MAX_OUTPUT;
  const actualCommand = options.sudo ? `sudo ${command}` : command;

  console.error('[ssh] Executing:', actualCommand);
  const startTime = Date.now();

  const conn = await getConnection();

  return new Promise<ExecResult>((resolve, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      console.error('[ssh] Command timed out after', timeout, 'ms');
      // Try to signal the process
      try {
        stream?.signal?.('KILL');
      } catch {
        // ignore
      }
      try {
        stream?.close?.();
      } catch {
        // ignore
      }
    }, timeout);

    let stream: any;

    conn.exec(actualCommand, (err, s) => {
      if (err) {
        clearTimeout(timer);
        reject(new Error(`SSH exec failed: ${err.message}`));
        return;
      }

      stream = s;

      s.on('data', (data: Buffer) => {
        if (stdoutBuf.length < maxOutput) {
          stdoutBuf += data.toString('utf-8');
          if (stdoutBuf.length > maxOutput) {
            stdoutBuf = stdoutBuf.substring(0, maxOutput);
            stdoutTruncated = true;
          }
        }
      });

      s.stderr.on('data', (data: Buffer) => {
        if (stderrBuf.length < maxOutput) {
          stderrBuf += data.toString('utf-8');
          if (stderrBuf.length > maxOutput) {
            stderrBuf = stderrBuf.substring(0, maxOutput);
            stderrTruncated = true;
          }
        }
      });

      s.on('close', (code: number | null) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        if (timedOut) {
          resolve({
            stdout: stdoutBuf,
            stderr: stderrBuf + '\n[Command timed out]',
            exitCode: 124, // standard timeout exit code
            truncated: stdoutTruncated || stderrTruncated,
            durationMs,
          });
          return;
        }

        const result: ExecResult = {
          stdout: stdoutBuf,
          stderr: stderrBuf,
          exitCode: code ?? -1,
          truncated: stdoutTruncated || stderrTruncated,
          durationMs,
        };

        console.error('[ssh] Result:', {
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          stdoutBytes: stdoutBuf.length,
          stderrBytes: stderrBuf.length,
          truncated: result.truncated,
        });

        resolve(result);
      });
    });
  });
}

// --- Shell Escape ---
export function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

// --- Lifecycle ---
export async function closeSSH(): Promise<void> {
  if (client) {
    console.error('[ssh] Closing SSH connection...');
    client.end();
    client = null;
    connecting = null;
  }
}
