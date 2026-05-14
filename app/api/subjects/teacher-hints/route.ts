import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { parseCombinedHints, stringifyHints } from "@/lib/hints";


export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get("subject_id");

    if (!subjectId) {
      return NextResponse.json({ error: "subject_id is required" }, { status: 400 });
    }

    // Fetch the general teacher hint for this subject
    const { data, error } = await supabase
      .from("teacher_hints")
      .select("*")
      .eq("subject_id", subjectId)
      .is("exam_type", null)
      .is("exam_label", null)
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") { // PGRST116 is no rows
      console.error("[Teacher Hints API] Error fetching hints:", error);
      return NextResponse.json({ error: "Failed to fetch teacher hints" }, { status: 500 });
    }

    const parsed = parseCombinedHints(data?.hint_text);

    return NextResponse.json({
      success: true,
      hint: data
        ? {
            ...data,
            teacherHints: parsed.teacherHints,
            paperPattern: parsed.paperPattern,
          }
        : null,
    });
  } catch (error) {
    console.error("[Teacher Hints API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { subject_id, hint_text, teacher_hints, paper_pattern, confidence } = body;

    if (
      !subject_id ||
      (
        typeof hint_text !== "string" &&
        typeof teacher_hints !== "string" &&
        typeof paper_pattern !== "string"
      )
    ) {
      return NextResponse.json(
        { error: "subject_id and at least one hint field are required" },
        { status: 400 }
      );
    }

    // Check if an existing hint exists
    const { data: existingHint } = await supabase
      .from("teacher_hints")
      .select("id")
      .eq("subject_id", subject_id)
      .is("exam_type", null)
      .is("exam_label", null)
      .limit(1)
      .single();

    const fallbackParsed = parseCombinedHints(typeof hint_text === "string" ? hint_text : null);
    const teacherHints =
      typeof teacher_hints === "string" ? teacher_hints : fallbackParsed.teacherHints;
    const paperPattern =
      typeof paper_pattern === "string" ? paper_pattern : fallbackParsed.paperPattern;

    // Upsert the hint
    const { data, error } = await supabase
      .from("teacher_hints")
      .upsert({
        id: existingHint?.id || undefined, // undefined relies on Postgres default to generate a new uuid if not present
        subject_id,
        hint_text: stringifyHints(teacherHints, paperPattern),
        confidence: typeof confidence === "string" ? confidence : "EXACT",
      })
      .select()
      .single();

    if (error) {
      console.error("[Teacher Hints API] Error saving hints:", error);
      return NextResponse.json({ error: "Failed to save teacher hints" }, { status: 500 });
    }

    try {
      const { tasks } = await import("@trigger.dev/sdk");
      await tasks.trigger("compute-te", { subjectId: subject_id });
    } catch (err) {
      console.warn("Failed to trigger TE computation", err);
    }

    return NextResponse.json({
      success: true,
      hint: {
        ...data,
        teacherHints: teacherHints.trim(),
        paperPattern: paperPattern.trim(),
        confidence: typeof confidence === "string" ? confidence : "EXACT",
      },
    });
  } catch (error) {
    console.error("[Teacher Hints API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
