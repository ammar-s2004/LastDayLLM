/* ============================================================================
   FILE: app/api/notes-v2/ask/route.ts
   ============================================================================
   
   Notes Ask API - RAG (Retrieval-Augmented Generation)
   
   Pipeline:
   1. Embed the student's question
   2. Fetch syllabus topics for the subject (for topic detection)
   3. Run hybrid Qdrant search: topic-filtered vector search with unfiltered fallback
   4. Build tier-annotated context
   5. Generate answer using Gemini
   
============================================================================ */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { GoogleGenAI } from '@google/genai';
import { generateEmbedding } from '@/lib/embeddings';
import { searchNotesHybrid } from '@/lib/qdrant';
import { NOTES_RAG_ANSWER_PROMPT } from '@/lib/ai-prompts';

const genAI = new GoogleGenAI({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
});

const MODEL = 'gemini-2.5-flash';

/**
 * POST /api/notes-v2/ask
 * 
 * Body:
 * - question: string (required)
 * - college_id: string (required) — MUST be the UUID, not the name
 * - subject_id: string (optional)
 * - teacher_name: string (optional)
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
        const { question, college_id, subject_id, teacher_name } = body;

        console.log('[Ask] 📥 Request received:', { question: question?.slice(0, 60), college_id, subject_id });

        // 3. Validate required fields
        if (!question || typeof question !== 'string') {
            return NextResponse.json(
                { error: 'Question is required' },
                { status: 400 }
            );
        }

        if (!college_id) {
            console.log('[Ask] ❌ Missing college_id — returning 400');
            return NextResponse.json(
                { error: 'college_id is required' },
                { status: 400 }
            );
        }

        // 4. Fetch syllabus topics for this subject (for topic detection)
        //    Run in parallel with embedding generation to save latency
        const [queryVector, syllabusTopics] = await Promise.all([
            generateEmbedding(question),
            subject_id
                ? supabase
                    .from('topics')
                    .select('name')
                    .eq('subject_id', subject_id)
                    .order('topic_no')
                    .then(({ data }) => (data ?? []).map((r: { name: string }) => r.name))
                : Promise.resolve([] as string[]),
        ]);

        console.log('[Ask] ✅ Embedding done. Vector dims:', queryVector.length);
        console.log('[Ask] 📚 Syllabus topics fetched:', syllabusTopics.length, syllabusTopics.slice(0, 5));
        console.log('[Ask] 🔍 Qdrant filter params:', { college_id, subject_id });

        // 5. Hybrid search: topic-filtered vector search with unfiltered fallback
        const { results: searchResults, detectedTopics } = await searchNotesHybrid(
            queryVector,
            { college_id, subject_id, teacher_name },
            syllabusTopics,
            question,
            10
        );

        console.log('[Ask] 🎯 Detected topics:', detectedTopics);
        console.log('[Ask] 📊 Search results:', searchResults.length, 'chunks found');
        if (searchResults.length > 0) {
            console.log('[Ask] 🏆 Top result — score:', searchResults[0].score.toFixed(4), '| file:', searchResults[0].payload.filename, '| topics:', searchResults[0].payload.matched_syllabus_topics);
        } else {
            console.log('[Ask] ❌ 0 results — college_id or subject_id filter likely mismatched data in Qdrant');
        }

        if (searchResults.length === 0) {
            return NextResponse.json({
                success: true,
                answer: "I couldn't find any relevant notes for your question. Please try a different question or check if notes are available for this subject.",
                sources: [],
                has_context: false,
                detected_topics: detectedTopics,
            });
        }

        // 6. Build tier-annotated context
        const contextParts = searchResults.map((result, i) => {
            const tier = result.payload.chunk_tier ?? 'unknown';
            const verbatimLine = result.payload.verbatim_type
                ? ` [Verbatim Type: ${result.payload.verbatim_type}]`
                : '';
            const topicsLine = result.payload.matched_syllabus_topics?.length
                ? ` [Topics: ${result.payload.matched_syllabus_topics.join(', ')}]`
                : '';

            return [
                `[Source ${i + 1}: ${result.payload.filename}] [Tier: ${tier}]${verbatimLine}${topicsLine}`,
                `Content: ${result.payload.content}`,
            ].join('\n');
        }).join('\n\n---\n\n');

        // 7. Build prompt
        const systemPrompt = NOTES_RAG_ANSWER_PROMPT;
        const userPrompt = `Context from notes:\n${contextParts}\n\n---\n\nQuestion: ${question}\n\nAnswer based on the context above:`;
        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

        // 8. Generate answer using Gemini
        const response = await genAI.models.generateContent({
            model: MODEL,
            contents: [{ parts: [{ text: fullPrompt }] }],
        });

        const answer = response.text || 'Unable to generate answer.';
        console.log('[Ask] ✅ Answer generated. Length:', answer.length, 'chars');

        // 9. Format sources with tier metadata
        const sources = searchResults.map((r, i) => ({
            index: i + 1,
            filename: r.payload.filename,
            teacher: r.payload.teacher_name,
            subject: r.payload.subject_name,
            chunk_tier: r.payload.chunk_tier,
            verbatim_type: r.payload.verbatim_type ?? null,
            score: r.score,
            source_page_range: r.payload.source_page_range ?? null,
            section_context: r.payload.section_context ?? null,
            matched_topics: r.payload.matched_syllabus_topics ?? [],
        }));

        return NextResponse.json({
            success: true,
            question,
            answer,
            sources,
            has_context: true,
            chunks_used: searchResults.length,
            detected_topics: detectedTopics,
        });

    } catch (error) {
        console.error('[Ask] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate answer', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
