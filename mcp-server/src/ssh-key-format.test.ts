import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { utils } from 'ssh2';
import { normalizePrivateKey } from './ssh.js';

// --- Test key generators ---

function generatePKCS8Ed25519(): string {
  const { privateKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return privateKey;
}

function generateOpenSSHKey(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-test-'));
  const keyPath = path.join(tmpDir, 'test_key');
  try {
    execSync(`ssh-keygen -t ed25519 -f ${keyPath} -N "" -q`);
    return fs.readFileSync(keyPath, 'utf-8');
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
}

function generateRSAPKCS1(): string {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return privateKey;
}

/** Simulate how env vars encode keys: replace real newlines with literal \n */
function simulateEnvVar(key: string): string {
  return key.replace(/\n/g, '\\n');
}

describe('SSH key format – reproducing "Unsupported key format"', () => {
  let pkcs8Key: string;
  let opensshKey: string;
  let rsaPkcs1Key: string;

  beforeAll(() => {
    pkcs8Key = generatePKCS8Ed25519();
    opensshKey = generateOpenSSHKey();
    rsaPkcs1Key = generateRSAPKCS1();
  });

  // =========================================================
  // Phase 1: Prove what ssh2 and Node crypto can/can't parse
  // =========================================================

  describe('format compatibility matrix', () => {
    it('ssh2 CANNOT parse PKCS#8 Ed25519 keys', () => {
      const result = utils.parseKey(pkcs8Key);
      expect(result).toBeInstanceOf(Error);
    });

    it('ssh2 CAN parse OpenSSH format Ed25519 keys', () => {
      const result = utils.parseKey(opensshKey);
      expect(result).not.toBeInstanceOf(Error);
    });

    it('ssh2 CAN parse RSA PKCS#1 keys', () => {
      const result = utils.parseKey(rsaPkcs1Key);
      expect(result).not.toBeInstanceOf(Error);
    });

    it('Node crypto CAN parse PKCS#8 Ed25519', () => {
      expect(() => crypto.createPrivateKey(pkcs8Key)).not.toThrow();
    });

    it('Node crypto CANNOT parse OpenSSH Ed25519 on this OpenSSL', () => {
      expect(() => crypto.createPrivateKey(opensshKey)).toThrow();
    });

    it('Node crypto CAN parse RSA PKCS#1', () => {
      expect(() => crypto.createPrivateKey(rsaPkcs1Key)).not.toThrow();
    });
  });

  // =========================================================
  // Phase 2: Reproduce the actual bug
  // =========================================================

  describe('FIX: auto-generated PKCS#8 key is converted for ssh2', () => {
    it('initSSHKeys generates PKCS#8 format (line 65 of ssh.ts)', () => {
      expect(pkcs8Key).toContain('-----BEGIN PRIVATE KEY-----');
    });

    it('normalizePrivateKey converts PKCS#8 Ed25519 to OpenSSH format', () => {
      const result = normalizePrivateKey(pkcs8Key);
      expect(result).toContain('-----BEGIN OPENSSH PRIVATE KEY-----');
    });

    it('ssh2 can parse the normalized key', () => {
      const normalized = normalizePrivateKey(pkcs8Key);
      const result = utils.parseKey(normalized);
      expect(result).not.toBeInstanceOf(Error);
    });
  });

  describe('BUG: OpenSSH key normalization destroys the key', () => {
    it('crypto.createPrivateKey fails on OpenSSH format', () => {
      // normalizePrivateKey calls crypto.createPrivateKey which fails
      expect(() => crypto.createPrivateKey(opensshKey)).toThrow();
    });

    it('normalizePrivateKey falls back to raw key (which ssh2 CAN parse)', () => {
      // The catch block returns the raw key, which happens to work
      // because ssh2 CAN parse OpenSSH format
      const result = normalizePrivateKey(opensshKey);
      expect(result).toBe(opensshKey); // returned as-is
      expect(utils.parseKey(result)).not.toBeInstanceOf(Error); // ssh2 is fine
    });
  });

  describe('BUG: env-encoded keys with literal \\n', () => {
    it('env-encoded key is unparseable by both crypto and ssh2', () => {
      const envEncoded = simulateEnvVar(opensshKey);

      // crypto can't parse it (literal \n is not a newline)
      expect(() => crypto.createPrivateKey(envEncoded)).toThrow();

      // ssh2 can't parse it either
      expect(utils.parseKey(envEncoded)).toBeInstanceOf(Error);

      // normalizePrivateKey returns the broken key
      const result = normalizePrivateKey(envEncoded);
      expect(result).toBe(envEncoded);
    });
  });

  // =========================================================
  // Phase 3: What the fix should achieve
  // =========================================================

  describe('EXPECTED: normalizePrivateKey should output ssh2-compatible format', () => {
    it('PKCS#8 Ed25519 should be converted to OpenSSH format', () => {
      const result = normalizePrivateKey(pkcs8Key);
      expect(result).toContain('-----BEGIN OPENSSH PRIVATE KEY-----');
      expect(utils.parseKey(result)).not.toBeInstanceOf(Error);
    });

    it('OpenSSH Ed25519 should pass through unchanged', () => {
      const result = normalizePrivateKey(opensshKey);
      expect(result).toContain('-----BEGIN OPENSSH PRIVATE KEY-----');
      expect(utils.parseKey(result)).not.toBeInstanceOf(Error);
    });

    it('RSA PKCS#1 should pass through (ssh2 supports it)', () => {
      const result = normalizePrivateKey(rsaPkcs1Key);
      expect(utils.parseKey(result)).not.toBeInstanceOf(Error);
    });

    it('env-encoded OpenSSH key (after \\n decode) should work', () => {
      // Simulate: env var has literal \n → code replaces with real newlines
      const envEncoded = simulateEnvVar(opensshKey);
      const decoded = envEncoded.replace(/\\n/g, '\n');
      const result = normalizePrivateKey(decoded);
      expect(utils.parseKey(result)).not.toBeInstanceOf(Error);
    });

    it('env-encoded PKCS#8 key (after \\n decode) should be converted', () => {
      const envEncoded = simulateEnvVar(pkcs8Key);
      const decoded = envEncoded.replace(/\\n/g, '\n');
      const result = normalizePrivateKey(decoded);
      expect(utils.parseKey(result)).not.toBeInstanceOf(Error);
    });

    it('invalid key should return raw key (graceful fallback)', () => {
      const result = normalizePrivateKey('garbage');
      expect(result).toBe('garbage');
    });
  });
});
