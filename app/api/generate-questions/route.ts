import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";

import { createClient } from "@/lib/supabase-server";

type OrchestrateGenerationTask = typeof import("@/trigger/tasks/orchestrate-generation").orchestrateGenerationTask;

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
    const { subjectId, predictionRunId } = body as {
      subjectId?: string;
      predictionRunId?: string;
    };

    if (!subjectId) {
      return NextResponse.json({ error: "subjectId is required" }, { status: 400 });
    }

    if (!predictionRunId) {
      return NextResponse.json({ error: "predictionRunId is required" }, { status: 400 });
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

    const { data: predictionRun, error: predictionRunError } = await supabase
      .from("prediction_runs")
      .select("id")
      .eq("id", predictionRunId)
      .eq("subject_id", subjectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (predictionRunError) {
      return NextResponse.json({ error: predictionRunError.message }, { status: 500 });
    }

    if (!predictionRun) {
      return NextResponse.json({ error: "Prediction run not found" }, { status: 404 });
    }

    const { data: modules, error: modulesError } = await supabase
      .from("modules")
      .select("id")
      .eq("subject_id", subjectId)
      .order("module_no", { ascending: true });

    if (modulesError) {
      return NextResponse.json({ error: modulesError.message }, { status: 500 });
    }

    if (!modules?.length) {
      return NextResponse.json({ error: "No modules found for subject" }, { status: 400 });
    }

    // Resolve which modules have topics in the exam scope
    const { data: scopeData } = await supabase
      .from("exam_scopes")
      .select("exam_scope_topics(topics(module_id))")
      .eq("subject_id", subjectId)
      .eq("user_id", user.id);

    const scopedModuleIds = new Set<string>(
      (scopeData ?? []).flatMap((scope: any) =>
        (scope.exam_scope_topics ?? [])
          .map((entry: any) => entry.topics?.module_id)
          .filter((id: unknown): id is string => typeof id === "string")
      )
    );

    // Only trigger for modules in scope; fall back to all if no scope exists
    const targetModules = scopedModuleIds.size > 0
      ? modules.filter((m) => scopedModuleIds.has(m.id))
      : modules;

    if (!targetModules.length) {
      return NextResponse.json({ error: "No in-scope modules found" }, { status: 400 });
    }

    const handle = await tasks.trigger<OrchestrateGenerationTask>(
      "orchestrate-generation",
      {
        subjectId,
        userId: user.id,
        moduleIds: targetModules.map((m) => m.id),
        predictionRunId,
        totalModulesInScope: targetModules.length,
      }
    );

    return NextResponse.json(
      {
        success: true,
        runId: handle.id,
        modulesInScope: targetModules.length,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[Generate Questions API] POST failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
