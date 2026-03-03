import { describe, it, expect } from 'vitest';
import { shellEscape } from './ssh.js';

describe('ssh module', () => {
  describe('shellEscape', () => {
    it('should wrap simple string in single quotes', () => {
      expect(shellEscape('hello')).toBe("'hello'");
    });

    it('should escape single quotes in string', () => {
      expect(shellEscape("it's")).toBe("'it'\\''s'");
    });

    it('should handle empty string', () => {
      expect(shellEscape('')).toBe("''");
    });

    it('should handle path with spaces', () => {
      expect(shellEscape('/path/to/my file.txt')).toBe("'/path/to/my file.txt'");
    });

    it('should handle string with special shell characters', () => {
      expect(shellEscape('$(rm -rf /)')).toBe("'$(rm -rf /)'");
    });

    it('should handle semicolons and pipes', () => {
      expect(shellEscape('foo; bar | baz')).toBe("'foo; bar | baz'");
    });

    it('should handle backticks', () => {
      expect(shellEscape('`whoami`')).toBe("'`whoami`'");
    });

    it('should handle multiple single quotes', () => {
      expect(shellEscape("it's a 'test'")).toBe("'it'\\''s a '\\''test'\\'''");
    });
  });
});
