/* ============================================================================
   FILE: app/api/notes-v2/search/route.ts
   ============================================================================
   
   Notes Search API - Vector Similarity Search
   
   Returns relevant chunks from Qdrant based on query embedding
   
============================================================================ */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateEmbedding } from '@/lib/embeddings';
import { searchNotes } from '@/lib/qdrant';

/**
 * POST /api/notes-v2/search
 * 
 * Body:
 * - query: string (required)
 * - college_id: string (required)
 * - subject_id: string (optional)
 * - teacher_name: string (optional)
 * - chunk_tier: 'digest' | 'verbatim' (optional)
 * - limit: number (optional, default 10)
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. Verify authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // 2. Parse request body
        const body = await req.json();
        const { query, college_id, subject_id, teacher_name, chunk_tier, limit = 10 } = body;

        // 3. Validate required fields
        if (!query || typeof query !== 'string') {
            return NextResponse.json(
                { error: 'Query is required' },
                { status: 400 }
            );
        }

        if (!college_id) {
            return NextResponse.json(
                { error: 'college_id is required' },
                { status: 400 }
            );
        }

        // 4. Generate query embedding
        const queryVector = await generateEmbedding(query);

        // 5. Search Qdrant
        const results = await searchNotes(queryVector, {
            college_id,
            subject_id,
            teacher_name,
            chunk_tier,
        }, Math.min(limit, 20));

        // 6. Format results with full tier metadata
        const formattedResults = results.map(result => ({
            id: result.id,
            score: result.score,
            content: result.payload.content,
            filename: result.payload.filename,
            file_type: result.payload.file_type,
            subject_name: result.payload.subject_name,
            college_name: result.payload.college_name,
            teacher_name: result.payload.teacher_name,
            chunk_index: result.payload.chunk_index,
            chunk_tier: result.payload.chunk_tier,
            verbatim_type: result.payload.verbatim_type ?? null,
            teacher_emphasis: result.payload.teacher_emphasis ?? null,
            matched_syllabus_topics: result.payload.matched_syllabus_topics ?? null,
            topic_tags: result.payload.topic_tags ?? null,
            source_page_range: result.payload.source_page_range ?? null,
            section_context: result.payload.section_context ?? null,
        }));

        return NextResponse.json({
            success: true,
            query,
            results: formattedResults,
            count: formattedResults.length,
        });

    } catch (error) {
        console.error('[Search] Error:', error);
        return NextResponse.json(
            { error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

