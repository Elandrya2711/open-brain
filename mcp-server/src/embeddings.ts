import { OpenAI } from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
console.error('[embeddings] Initializing OpenAI client with API key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET');

const client = new OpenAI({
  apiKey: apiKey,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  console.error('[embeddings.generateEmbedding] Called with text length:', text?.length);

  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  try {
    console.error('[embeddings.generateEmbedding] Calling OpenAI API with model: text-embedding-3-small');
    const response = await client.embeddings.create({
      input: text,
      model: 'text-embedding-3-small',
    });

    console.error('[embeddings.generateEmbedding] Received response, extracting embedding');
    const embedding = response.data[0].embedding;

    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      throw new Error(`Invalid embedding format: expected array of 1536 dims, got ${Array.isArray(embedding) ? embedding.length : typeof embedding}`);
    }

    console.error('[embeddings.generateEmbedding] Successfully generated embedding');
    return embedding;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[embeddings.generateEmbedding] Error:', errorMsg, error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
    throw error;
  }
}
