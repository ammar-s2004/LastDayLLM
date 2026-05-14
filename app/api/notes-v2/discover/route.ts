/* ============================================================================
   FILE: app/api/notes-v2/discover/route.ts
   ============================================================================
   
   Notes Discovery API
   
   Lists all available notes in a college for browsing
   
============================================================================ */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/**
 * GET /api/notes-v2/discover?college_id=xxx&subject_id=xxx
 * 
 * Query params:
 * - college_id: string (required)
 * - subject_id: string (optional)
 */
export async function GET(req: NextRequest) {
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

        // 2. Parse query params
        const { searchParams } = new URL(req.url);
        const collegeId = searchParams.get('college_id');
        const subjectId = searchParams.get('subject_id');

        if (!collegeId) {
            return NextResponse.json(
                { error: 'college_id is required' },
                { status: 400 }
            );
        }

        // 3. Query Supabase for notes metadata
        let query = supabase
            .from('qdrant_notes_metadata')
            .select(`
                id,
                original_filename,
                file_type,
                teacher_name,
                chunk_count,
                is_best_collection,
                created_at,
                subjects!inner (
                    id,
                    name
                )
            `)
            .eq('college_id', collegeId)
            .eq('processing_status', 'COMPLETED')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (subjectId) {
            query = query.eq('subject_id', subjectId);
        }

        const { data: notes, error: queryError } = await query;

        if (queryError) {
            console.error('[Discover] Query error:', queryError);
            return NextResponse.json(
                { error: 'Failed to fetch notes' },
                { status: 500 }
            );
        }

        // 4. Format results
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formattedNotes = notes?.map((note: any) => ({
            id: note.id,
            filename: note.original_filename,
            file_type: note.file_type,
            teacher_name: note.teacher_name,
            subject_id: note.subjects?.id,
            subject_name: note.subjects?.name,
            chunk_count: note.chunk_count,
            is_best: note.is_best_collection,
            created_at: note.created_at,
        })) || [];

        // 5. Group by subject
        const bySubject: Record<string, typeof formattedNotes> = {};
        for (const note of formattedNotes) {
            const key = note.subject_name || 'Unknown';
            if (!bySubject[key]) {
                bySubject[key] = [];
            }
            bySubject[key].push(note);
        }

        return NextResponse.json({
            success: true,
            college_id: collegeId,
            total_count: formattedNotes.length,
            notes: formattedNotes,
            by_subject: bySubject,
        });

    } catch (error) {
        console.error('[Discover] Error:', error);
        return NextResponse.json(
            { error: 'Discovery failed' },
            { status: 500 }
        );
    }
}
