import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();

    try {
        const { id: subjectId } = await context.params;

        // ---------------------------------------------------------------------
        // 1. AUTHENTICATION
        // ---------------------------------------------------------------------
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // ---------------------------------------------------------------------
        // 2. SUBJECT OWNERSHIP CHECK
        // ---------------------------------------------------------------------
        const { data: subject, error: subjectError } = await supabase
            .from("subjects")
            .select("id, name, code")
            .eq("id", subjectId)
            .eq("user_id", user.id)
            .single();

        if (subjectError || !subject) {
            return NextResponse.json(
                { error: "Subject not found" },
                { status: 404 }
            );
        }

        // ---------------------------------------------------------------------
        // 3. FETCH MODULES + TOPICS (ORDERED)
        // ---------------------------------------------------------------------
        const { data: modules, error: modulesError } = await supabase
            .from("modules")
            .select(`
        id,
        module_no,
        title,
        topics (
          id,
          name,
          topic_no
        )
      `)
            .eq("subject_id", subjectId)
            .order("module_no", { ascending: true })
            .order("topic_no", { foreignTable: "topics", ascending: true });

        if (modulesError) {
            throw modulesError;
        }

        if (!modules || modules.length === 0) {
            return NextResponse.json(
                {
                    error:
                        "No syllabus found for this subject. Please upload syllabus first.",
                    code: "NO_SYLLABUS",
                },
                { status: 404 }
            );
        }

        // ---------------------------------------------------------------------
        // 4. SUCCESS RESPONSE
        // ---------------------------------------------------------------------
        return NextResponse.json({
            subject,
            modules,
        });
    } catch (err: any) {
        console.error("Fetch subject structure failed", err);

        return NextResponse.json(
            { error: err?.message ?? "Internal server error" },
            { status: 500 }
        );
    }
}
