import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase-server";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await context.params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { college_assignment_factor } = body as {
      college_assignment_factor?: number;
    };

    const { data: subject, error: subjectError } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subjectError) {
      return NextResponse.json({ error: subjectError.message }, { status: 500 });
    }

    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("subjects")
      .update({ college_assignment_factor })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Subject Config API] PATCH failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
