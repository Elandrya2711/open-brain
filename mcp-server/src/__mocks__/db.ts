import { vi } from 'vitest';
import type { Memory, MemoryStats } from '../db.js';

export const insertMemory = vi.fn().mockImplementation(async (
  content: string,
  embedding: number[],
  type: string = 'note',
  source: string = 'claude-code',
  summary?: string
) => {
  if (!content || content.trim().length === 0) {
    throw new Error('Content is required');
  }
  return 'test-uuid-' + Math.random().toString(36).substring(7);
});

export const similaritySearch = vi.fn().mockImplementation(async (
  queryEmbedding: number[],
  limit: number = 10
): Promise<Memory[]> => {
  return [];
});

export const getRecentMemories = vi.fn().mockImplementation(async (
  days: number = 7
): Promise<Memory[]> => {
  return [];
});

export const getStats = vi.fn().mockImplementation(async (): Promise<MemoryStats> => {
  return {
    total: 0,
    byType: {},
    oldestDate: '',
    newestDate: '',
  };
});

export const deleteMemory = vi.fn().mockImplementation(async (
  id: string
): Promise<boolean> => {
  return true;
});

export const closePool = vi.fn().mockImplementation(async () => {
  // noop
});

export default { insertMemory, similaritySearch, getRecentMemories, getStats, deleteMemory, closePool };
