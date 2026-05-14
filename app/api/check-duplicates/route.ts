/* ============================================================================
   FILE: app/api/check-duplicates/route.ts
   ============================================================================
   Checks if files with given SHA-256 hashes already exist in the database.
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
        const { subject_id, hashes } = body as {
            subject_id: string;
            hashes: Array<{ hash: string; filename: string }>;
        };

        if (!subject_id || !hashes || !Array.isArray(hashes) || hashes.length === 0) {
            return NextResponse.json(
                { error: "Missing required fields: subject_id, hashes (array)" },
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

        /* ---------- SUBJECT OWNERSHIP CHECK ---------- */
        const { data: subject, error: ownershipError } = await supabase
            .from("subjects")
            .select("id")
            .eq("id", subject_id)
            .eq("user_id", user.id)
            .maybeSingle();

        if (ownershipError || !subject) {
            return NextResponse.json(
                { error: "Subject not found or access denied" },
                { status: 403 }
            );
        }

        /* ---------- CHECK HASHES AGAINST DB ---------- */
        const hashValues = hashes.map(h => h.hash);

        const { data: existingResources, error: queryError } = await supabase
            .from("resources")
            .select("id, content_hash, resource_type, status, meta")
            .eq("subject_id", subject_id)
            .in("content_hash", hashValues)
            .neq("status", "FAILED"); // Ignore failed uploads (they can be retried)

        if (queryError) {
            console.error("Check duplicates query error:", queryError);
            return NextResponse.json(
                { error: "Database query failed" },
                { status: 500 }
            );
        }

        /* ---------- BUILD RESPONSE ---------- */
        const existingHashMap = new Map<string, {
            resourceId: string;
            originalFilename: string;
            resourceType: string;
            status: string;
        }>();

        (existingResources || []).forEach(resource => {
            if (resource.content_hash) {
                // original_filename is stored in meta JSONB
                const originalFilename = (resource.meta as any)?.original_filename || 'Existing file';
                existingHashMap.set(resource.content_hash, {
                    resourceId: resource.id,
                    originalFilename,
                    resourceType: resource.resource_type,
                    status: resource.status,
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
                existingResourceId: existing?.resourceId || null,
                existingResourceType: existing?.resourceType || null,
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
        console.error("Check duplicates error:", err);
        return NextResponse.json(
            { error: err.message ?? "Internal server error" },
            { status: 500 }
        );
    }
}
