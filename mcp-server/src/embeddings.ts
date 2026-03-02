import { OpenAI } from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  try {
    const response = await client.embeddings.create({
      input: text,
      model: 'text-embedding-3-small',
    });

    const embedding = response.data[0].embedding;

    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      throw new Error('Invalid embedding format');
    }

    return embedding;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
    throw error;
  }
}
