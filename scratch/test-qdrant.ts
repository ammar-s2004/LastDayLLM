import { getQdrantClient, NOTES_COLLECTION } from '../lib/qdrant/client';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    const client = getQdrantClient();
    const scrollResult = await client.scroll(NOTES_COLLECTION, {
        limit: 10,
        with_payload: true,
    });
    
    for (const point of scrollResult.points) {
        console.log("Subject:", point.payload?.subject_id);
        console.log("Payload topics:", point.payload?.matched_syllabus_topics);
    }
}

run().catch(console.error);
