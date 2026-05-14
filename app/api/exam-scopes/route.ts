import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const VALID_EXAM_TYPES = new Set([
    "TERM TEST 1",
    "TERM TEST 2",
    "END SEMISTER EXAMINATION",
]);

/* ======================================================
   POST — Save Exam Scope (ATOMIC, NORMALIZED)
====================================================== */

export async function POST(req: NextRequest) {
    const supabase = await createClient();

    try {
        /* ---------- AUTH ---------- */
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        /* ---------- INPUT ---------- */
        // Accepts:
        //   included_topics: Array<{ topic_id: string, selected_sub_topics?: string[] | null }>
        // OR (legacy): included_topic_ids: string[]
        const body = await req.json();
        const { subject_id, exam_type } = body;

        // Support both legacy (flat ids array) and new (objects with sub-topics)
        let included_topics: Array<{ topic_id: string; selected_sub_topics: string[] | null }>;

        if (Array.isArray(body.included_topics)) {
            included_topics = body.included_topics;
        } else if (Array.isArray(body.included_topic_ids)) {
            // Legacy: flat id array → convert to objects, null = all sub-topics
            included_topics = body.included_topic_ids.map((id: string) => ({
                topic_id: id,
                selected_sub_topics: null,
            }));
        } else {
            return NextResponse.json(
                { error: "included_topics or included_topic_ids required" },
                { status: 400 }
            );
        }

        if (!subject_id || !exam_type) {
            return NextResponse.json(
                { error: "subject_id and exam_type required" },
                { status: 400 }
            );
        }

        if (!VALID_EXAM_TYPES.has(exam_type)) {
            return NextResponse.json({ error: "Invalid exam_type" }, { status: 400 });
        }

        if (included_topics.length === 0) {
            return NextResponse.json(
                { error: "At least one topic must be selected" },
                { status: 400 }
            );
        }

        /* ---------- SUBJECT OWNERSHIP ---------- */
        const { data: subject } = await supabase
            .from("subjects")
            .select("id")
            .eq("id", subject_id)
            .eq("user_id", user.id)
            .single();

        if (!subject) {
            return NextResponse.json(
                { error: "Subject not found or access denied" },
                { status: 404 }
            );
        }

        /* ---------- TOPIC OWNERSHIP ---------- */
        const topicIds = included_topics.map(t => t.topic_id);
        const { data: topics } = await supabase
            .from("topics")
            .select("id")
            .eq("subject_id", subject_id)
            .in("id", topicIds);

        if (!topics || topics.length !== topicIds.length) {
            return NextResponse.json(
                { error: "Some topics do not belong to this subject" },
                { status: 400 }
            );
        }

        /* ---------- PARENT TOPICS ONLY ---------- */
        const { data: parentTopics } = await supabase
            .from("topics")
            .select("id")
            .eq("subject_id", subject_id)
            .in("id", topicIds)
            .is("parent_topic_id", null);

        if (!parentTopics || parentTopics.length !== topicIds.length) {
            return NextResponse.json(
                { error: "Exam scope must reference heading-level topics only, not sub-topics" },
                { status: 400 }
            );
        }

        /* ---------- ATOMIC WRITE ---------- */
        const { data: scopeId, error } = await supabase.rpc(
            "save_exam_scope_with_sub_topics",
            {
                p_subject_id: subject_id,
                p_user_id: user.id,
                p_exam_type: exam_type,
                // Pass topics as jsonb array with optional selected_sub_topics
                p_topics: included_topics.map(t => ({
                    topic_id: t.topic_id,
                    selected_sub_topics: t.selected_sub_topics ?? null,
                })),
            }
        );

        if (error) {
            throw error;
        }

        let spRunId: string | null = null;
        try {
            const { tasks } = await import("@trigger.dev/sdk");
            const handle = await tasks.trigger("compute-sp", {
                subjectId: subject_id,
                topicIds,
            });
            spRunId = handle.id;
        } catch (triggerError) {
            console.warn("Failed to trigger compute-sp task", triggerError);
        }

        return NextResponse.json({
            success: true,
            exam_scope_id: scopeId,
            sp_run_id: spRunId,
        });
    } catch (err: any) {
        console.error("Save exam scope failed", err);
        return NextResponse.json(
            { error: err?.message ?? "Internal server error" },
            { status: 500 }
        );
    }
}

/* ======================================================
   GET — Retrieve Exam Scopes with Topics
====================================================== */

export async function GET(req: NextRequest) {
    const supabase = await createClient();

    try {
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const subjectId = searchParams.get("subject_id");
        const examType = searchParams.get("exam_type");

        if (!subjectId) {
            return NextResponse.json(
                { error: "subject_id is required" },
                { status: 400 }
            );
        }

        let query = supabase
            .from("exam_scopes")
            .select(
                `
        id,
        exam_type,
        created_at,
        exam_scope_topics (
          topic_id,
          selected_sub_topics
        )
      `
            )
            .eq("subject_id", subjectId)
            .eq("user_id", user.id);

        if (examType) {
            query = query.eq("exam_type", examType);
        }

        const { data, error } = await query;
        if (error) throw error;

        const scopes = (data || []).map((s) => ({
            id: s.id,
            exam_type: s.exam_type,
            created_at: s.created_at,
            // Legacy flat id array (for backwards compat with existing callers)
            included_topic_ids: s.exam_scope_topics.map(
                (t: { topic_id: string }) => t.topic_id
            ),
            // Granular: per-topic sub-topic selection
            included_topics: s.exam_scope_topics.map(
                (t: { topic_id: string; selected_sub_topics?: string[] | null }) => ({
                    topic_id: t.topic_id,
                    selected_sub_topics: t.selected_sub_topics ?? null, // null = all
                })
            ),
        }));

        return NextResponse.json({ scopes });
    } catch (err: any) {
        console.error("Fetch exam scopes failed", err);
        return NextResponse.json(
            { error: err?.message ?? "Internal server error" },
            { status: 500 }
        );
    }
}
