/* ============================================================================
   FILE: app/api/check-notes-duplicates/route.ts
   ============================================================================
   Checks if notes files with given SHA-256 hashes already exist in the database.
   Used for client-side duplicate detection before upload to save API calls.
============================================================================ */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
    const supabase = await createClient();

    try {
        /* ---------- AUTHENTICATION ---------- */
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        /* ---------- EXTRACT REQUEST DATA ---------- */
        const body = await req.json();
        console.log('[check-notes-duplicates] Received body:', JSON.stringify(body, null, 2));

        const { college_id: collegeName, subject_id, hashes } = body as {
            college_id: string; // This will be the college name now
            subject_id: string;
            hashes: Array<{ hash: string; filename: string }>;
        };

        // Validate initial fields
        if (!collegeName || !subject_id || !hashes || !Array.isArray(hashes) || hashes.length === 0) {
            console.error('[check-notes-duplicates] Validation failed:', {
                has_college_id: !!collegeName,
                has_subject_id: !!subject_id,
                has_hashes: !!hashes,
                is_array: Array.isArray(hashes),
                hashes_length: hashes?.length
            });
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing required fields: college_id (college name), subject_id, hashes (array)",
                    received: {
                        college_id: !!collegeName,
                        subject_id: !!subject_id,
                        hashes: Array.isArray(hashes) ? hashes.length : 'not an array'
                    }
                },
                { status: 400 }
            );
        }

        // Limit to prevent abuse
        if (hashes.length > 20) {
            return NextResponse.json(
                { error: "Too many hashes to check (max 20)" },
                { status: 400 }
            );
        }

        /* ---------- LOOKUP COLLEGE UUID FROM NAME ---------- */
        const { data: college, error: collegeQueryError } = await supabase
            .from('colleges')
            .select('id')
            .ilike('name', collegeName)
            .maybeSingle();

        if (collegeQueryError) {
            console.error("Check notes duplicates college lookup error:", collegeQueryError);
            return NextResponse.json(
                { error: "Database query failed during college lookup" },
                { status: 500 }
            );
        }

        if (!college) {
            // College doesn't exist yet - no duplicates possible for this college
            console.log('[check-notes-duplicates] College not found:', collegeName);
            return NextResponse.json({
                success: true,
                results: hashes.map(h => ({
                    filename: h.filename,
                    hash: h.hash,
                    isDuplicate: false,
                    existingAs: null,
                    existingNoteId: null,
                })),
                duplicateCount: 0,
                uniqueCount: hashes.length,
            });
        }

        const collegeId = college.id;

        /* ---------- CHECK HASHES AGAINST DB ---------- */
        const hashValues = hashes.map(h => h.hash);

        const { data: existingNotes, error: queryError } = await supabase
            .from("qdrant_notes_metadata")
            .select("id, content_hash, original_filename, processing_status")
            .eq("college_id", collegeId) // Use the looked-up collegeId
            .eq("subject_id", subject_id)
            .in("content_hash", hashValues)
            .is("deleted_at", null)
            .neq("processing_status", "FAILED");

        if (queryError) {
            console.error("Check notes duplicates query error:", queryError);
            return NextResponse.json(
                { error: "Database query failed" },
                { status: 500 }
            );
        }

        /* ---------- BUILD RESPONSE ---------- */
        const existingHashMap = new Map<string, {
            noteId: string;
            originalFilename: string;
            status: string;
        }>();

        (existingNotes || []).forEach(note => {
            if (note.content_hash) {
                existingHashMap.set(note.content_hash, {
                    noteId: note.id,
                    originalFilename: note.original_filename || 'Existing file',
                    status: note.processing_status,
                });
            }
        });

        // Map input hashes to results
        const results = hashes.map(({ hash, filename }) => {
            const existing = existingHashMap.get(hash);
            return {
                filename,
                hash,
                isDuplicate: !!existing,
                existingAs: existing?.originalFilename || null,
                existingNoteId: existing?.noteId || null,
            };
        });

        const duplicateCount = results.filter(r => r.isDuplicate).length;

        return NextResponse.json({
            success: true,
            results,
            duplicateCount,
            uniqueCount: results.length - duplicateCount,
        });

    } catch (err: any) {
        console.error("Check notes duplicates error:", err);
        return NextResponse.json(
            { error: err.message ?? "Internal server error" },
            { status: 500 }
        );
    }
}
