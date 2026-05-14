/* ============================================================================
   FILE: lib/embeddings/google.ts
   ============================================================================
   
   Google Gemini Embedding Service
   
   Uses text-embedding-004 model (768 dimensions)
   Free tier: 1500 requests/day via AI Studio
   
   Environment Variables Required:
   - GOOGLE_AI_API_KEY: Your Google AI Studio API key
   
============================================================================ */

import { GoogleGenAI } from '@google/genai';
import { EMBEDDING_MODEL } from '@/lib/ai-limits';

// Model configuration - using latest stable model
export const EMBEDDING_DIMENSIONS = 768;

// Rate limiting (free tier)
const MAX_BATCH_SIZE = 100;
const RATE_LIMIT_DELAY_MS = 100;

// Lazy initialization to avoid issues with missing env vars at import time
let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
    if (!genAI) {
        const apiKey = process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
        }
        genAI = new GoogleGenAI({ apiKey });
    }
    return genAI;
}

/**
 * Normalize embedding vector using L2 normalization
 * Required for dimensions other than 3072 to ensure accurate semantic similarity
 * @param vector Embedding vector to normalize
 * @returns Normalized vector with magnitude of 1
 */
function normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vector;
    return vector.map(val => val / magnitude);
}

/**
 * Generate embedding for a single text
 * @param text Text to embed
 * @returns 768-dimensional embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
        throw new Error('Cannot generate embedding for empty text');
    }

    // Truncate if too long (max ~2048 tokens for Gemini)
    const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;

    const client = getGenAI();

    const response = await client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{ parts: [{ text: truncatedText }] }],
        config: {
            outputDimensionality: EMBEDDING_DIMENSIONS, // Request 768 dimensions
        }
    });

    if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error('No embedding returned from API');
    }

    const embedding = response.embeddings[0];
    if (!embedding.values || embedding.values.length === 0) {
        throw new Error('Empty embedding values returned from API');
    }

    // Normalize the vector (required for dimensions other than 3072)
    const normalizedVector = normalizeVector(embedding.values);

    return normalizedVector;
}

/**
 * Generate embeddings for multiple texts in batches
 * @param texts Array of texts to embed
 * @returns Array of embedding vectors
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
        return [];
    }

    const embeddings: number[][] = [];

    // Process in batches to avoid rate limits
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        const batch = texts.slice(i, i + MAX_BATCH_SIZE);

        // Generate embeddings for this batch
        const batchPromises = batch.map(text => generateEmbedding(text));
        const batchResults = await Promise.all(batchPromises);

        embeddings.push(...batchResults);

        // Small delay between batches to avoid rate limiting
        if (i + MAX_BATCH_SIZE < texts.length) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }
    }

    console.log(`[Embeddings] Generated ${embeddings.length} embeddings`);
    return embeddings;
}

/**
 * Test embedding service connectivity
 */
export async function testEmbeddingService(): Promise<boolean> {
    try {
        const testVector = await generateEmbedding('Test query for embedding service');
        return testVector.length === EMBEDDING_DIMENSIONS;
    } catch (error) {
        console.error('[Embeddings] Test failed:', error);
        return false;
    }
}
