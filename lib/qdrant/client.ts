/* ============================================================================
   FILE: lib/qdrant/client.ts
   ============================================================================
   
   Qdrant Client Singleton
   
   Connects to Qdrant Cloud and provides collection management.
   
   Environment Variables Required:
   - QDRANT_URL: Your Qdrant Cloud cluster URL
   - QDRANT_API_KEY: Your Qdrant API key
   
============================================================================ */

import { QdrantClient } from '@qdrant/js-client-rest';

// Collection name for notes
export const NOTES_COLLECTION = 'notes';

// Embedding dimensions (Google text-embedding-004 = 768)
export const EMBEDDING_DIMENSIONS = 768;

// Singleton instance
let qdrantClient: QdrantClient | null = null;

/**
 * Get or create Qdrant client singleton
 */
export function getQdrantClient(): QdrantClient {
    if (!qdrantClient) {
        const url = process.env.QDRANT_URL;
        const apiKey = process.env.QDRANT_API_KEY;

        if (!url) {
            throw new Error('QDRANT_URL environment variable is not set');
        }
        if (!apiKey) {
            throw new Error('QDRANT_API_KEY environment variable is not set');
        }

        qdrantClient = new QdrantClient({
            url,
            apiKey,
        });
    }

    return qdrantClient;
}

/**
 * Initialize the notes collection if it doesn't exist
 * Should be called once at app startup or deployment
 */
export async function initializeCollection(): Promise<void> {
    const client = getQdrantClient();

    // Check if collection already exists
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === NOTES_COLLECTION);

    if (exists) {
        console.log(`[Qdrant] Collection "${NOTES_COLLECTION}" already exists`);
        return;
    }

    // Create the collection with cosine similarity
    await client.createCollection(NOTES_COLLECTION, {
        vectors: {
            size: EMBEDDING_DIMENSIONS,
            distance: 'Cosine',
        },
        // Optimized for filtering
        optimizers_config: {
            indexing_threshold: 10000,
        },
        // Create payload indexes for fast filtering
        on_disk_payload: true,
    });

    // Create payload indexes for common filters
    await client.createPayloadIndex(NOTES_COLLECTION, {
        field_name: 'college_id',
        field_schema: 'keyword',
    });

    await client.createPayloadIndex(NOTES_COLLECTION, {
        field_name: 'subject_id',
        field_schema: 'keyword',
    });

    await client.createPayloadIndex(NOTES_COLLECTION, {
        field_name: 'upload_id',
        field_schema: 'keyword',
    });

    await client.createPayloadIndex(NOTES_COLLECTION, {
        field_name: 'teacher_name',
        field_schema: 'keyword',
    });

    await client.createPayloadIndex(NOTES_COLLECTION, {
        field_name: 'expires_at',
        field_schema: 'datetime',
    });

    await client.createPayloadIndex(NOTES_COLLECTION, {
        field_name: 'chunk_tier',
        field_schema: 'keyword',
    });

    await client.createPayloadIndex(NOTES_COLLECTION, {
        field_name: 'matched_syllabus_topics',
        field_schema: 'keyword',
    });

    await client.createPayloadIndex(NOTES_COLLECTION, {
        field_name: 'teacher_emphasis',
        field_schema: 'keyword',
    });

    console.log(`[Qdrant] Created collection "${NOTES_COLLECTION}" with indexes`);
}

/**
 * Get collection info and stats
 */
export async function getCollectionInfo() {
    const client = getQdrantClient();
    return await client.getCollection(NOTES_COLLECTION);
}

/**
 * Health check for Qdrant connection
 */
export async function healthCheck(): Promise<boolean> {
    try {
        const client = getQdrantClient();
        await client.getCollections();
        return true;
    } catch (error) {
        console.error('[Qdrant] Health check failed:', error);
        return false;
    }
}
