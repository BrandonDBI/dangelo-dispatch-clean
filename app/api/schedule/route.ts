import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function forbidden() {
  return NextResponse.json({ error: "Supervisor access required." }, { status: 403 });
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "Missing date range." }, { status: 400 });

  const db = supabaseAdmin();
  const [crewResult, jobsResult] = await Promise.all([
    db.from("crew").select("*").order("sort_order"),
    db.from("jobs")
      .select("*, assignments(crew_id)")
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date")
  ]);

  if (crewResult.error) return NextResponse.json({ error: crewResult.error.message }, { status: 500 });
  if (jobsResult.error) return NextResponse.json({ error: jobsResult.error.message }, { status: 500 });

  return NextResponse.json({ crew: crewResult.data || [], jobs: jobsResult.data || [] });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "supervisor") return forbidden();

  const body = await request.json();
  const db = supabaseAdmin();

  const { crewIds = [], ...job } = body;
  const { data, error } = await db.from("jobs").insert(job).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (crewIds.length) {
    const result = await db.from("assignments").insert(
      crewIds.map((crew_id: number) => ({ job_id: data.id, crew_id }))
    );
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "supervisor") return forbidden();

  const body = await request.json();
  const { id, crewIds = [], ...job } = body;
  if (!id) return NextResponse.json({ error: "Missing job id." }, { status: 400 });

  const db = supabaseAdmin();
  const update = await db.from("jobs").update(job).eq("id", id);
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 400 });

  const cleared = await db.from("assignments").delete().eq("job_id", id);
  if (cleared.error) return NextResponse.json({ error: cleared.error.message }, { status: 400 });

  if (crewIds.length) {
    const assigned = await db.from("assignments").insert(
      crewIds.map((crew_id: number) => ({ job_id: id, crew_id }))
    );
    if (assigned.error) return NextResponse.json({ error: assigned.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "supervisor") return forbidden();

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing job id." }, { status: 400 });

  const db = supabaseAdmin();
  const result = await db.from("jobs").delete().eq("id", id);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
