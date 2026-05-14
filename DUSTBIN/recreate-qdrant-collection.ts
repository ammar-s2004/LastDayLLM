/**
 * Script to recreate Qdrant collection with correct dimensions
 * 
 * WARNING: This will DELETE all existing vectors in the 'notes' collection!
 * Only run this if you're okay with losing existing data.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const NOTES_COLLECTION = 'notes';
const EMBEDDING_DIMENSIONS = 3072; // Updated from 768

async function recreateCollection() {
    const url = process.env.QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;

    if (!url || !apiKey) {
        console.error('❌ Missing QDRANT_URL or QDRANT_API_KEY in environment');
        process.exit(1);
    }

    const client = new QdrantClient({ url, apiKey });

    try {
        // Check if collection exists
        const collections = await client.getCollections();
        const exists = collections.collections.some(c => c.name === NOTES_COLLECTION);

        if (exists) {
            console.log(`⚠️  Collection "${NOTES_COLLECTION}" exists. Deleting...`);
            await client.deleteCollection(NOTES_COLLECTION);
            console.log('✅ Collection deleted');
        }

        // Create new collection with 3072 dimensions
        console.log(`📦 Creating collection "${NOTES_COLLECTION}" with ${EMBEDDING_DIMENSIONS} dimensions...`);
        await client.createCollection(NOTES_COLLECTION, {
            vectors: {
                size: EMBEDDING_DIMENSIONS,
                distance: 'Cosine',
            },
            optimizers_config: {
                indexing_threshold: 10000,
            },
            on_disk_payload: true,
        });

        // Create payload indexes for fast filtering
        console.log('🔍 Creating payload indexes...');

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

        console.log('✅ Collection recreated successfully!');
        console.log(`   - Dimensions: ${EMBEDDING_DIMENSIONS}`);
        console.log('   - Distance: Cosine');
        console.log('   - Indexes: college_id, subject_id, upload_id, teacher_name, expires_at');

    } catch (error) {
        console.error('❌ Error recreating collection:', error);
        process.exit(1);
    }
}

recreateCollection();
