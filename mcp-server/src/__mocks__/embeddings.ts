import { vi } from 'vitest';

// Generate a deterministic dummy vector for testing
export const generateEmbedding = vi.fn().mockImplementation(async (text: string) => {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }
  // Return a consistent dummy embedding for testing
  return new Array(1536).fill(0.1);
});
