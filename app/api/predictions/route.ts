import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";

import { createClient } from "@/lib/supabase-server";

type RunPredictionTask = typeof import("@/trigger/tasks/run-prediction").runPredictionTask;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { subjectId, examType, examLabel, moduleNos } = body as {
      subjectId?: string;
      examType?: string;
      examLabel?: string;
      moduleNos?: number[];
    };

    if (!subjectId) {
      return NextResponse.json({ error: "subjectId is required" }, { status: 400 });
    }

    const { data: subject, error: subjectError } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", subjectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subjectError) {
      return NextResponse.json({ error: subjectError.message }, { status: 500 });
    }

    if (!subject) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const handle = await tasks.trigger<RunPredictionTask>("run-prediction", {
      subjectId,
      userId: user.id,
      examType,
      examLabel,
      moduleNos,
    });

    return NextResponse.json({ runId: handle.id }, { status: 202 });
  } catch (error) {
    console.error("[Predictions API] POST failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get("subjectId");

    if (!subjectId) {
      return NextResponse.json({ error: "subjectId is required" }, { status: 400 });
    }

    const { data: run, error: runError } = await supabase
      .from("prediction_runs")
      .select("id, exam_type, exam_label, created_at, modules_in_scope")
      .eq("subject_id", subjectId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError) {
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }

    if (!run) {
      return NextResponse.json({ run: null, scores: [] });
    }

    const { data: scores, error: scoresError } = await supabase
      .from("prediction_topic_scores")
      .select("*, topics(name, module_id, parent_topic_id, parent:topics!parent_topic_id(name))")
      .eq("prediction_run_id", run.id);

    if (scoresError) {
      return NextResponse.json({ error: scoresError.message }, { status: 500 });
    }

    // Check if SP signal was truncated for this subject (any row flagged)
    const { data: truncatedRows } = await supabase
      .from("topic_sp_scores")
      .select("sp_truncated")
      .eq("subject_id", subjectId)
      .eq("sp_truncated", true)
      .limit(1);
    const spTruncated = (truncatedRows?.length ?? 0) > 0;

    return NextResponse.json({
      run: {
        id: run.id,
        exam_type: run.exam_type,
        exam_label: run.exam_label,
        created_at: run.created_at,
        modules_in_scope: run.modules_in_scope,
      },
      scores: scores ?? [],
      spTruncated,
    });
  } catch (error) {
    console.error("[Predictions API] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
