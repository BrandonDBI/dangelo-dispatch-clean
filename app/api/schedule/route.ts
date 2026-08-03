import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function forbidden() {
  return NextResponse.json({ error: "Supervisor access required." }, { status: 403 });
}

function cleanJob(body: any) {
  return {
    job_name: body.job_name,
    customer: body.customer || null,
    customer_phone: body.customer_phone || null,
    location: body.location || null,
    job_type: body.job_type || null,
    permit_number: body.permit_number || null,
    inspector: body.inspector || null,
    notes: body.notes || null,
    priority: body.priority || "scheduled",
    status: body.status || "open",
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    color: body.color || "#2563eb"
  };
}

async function equipmentConflict(
  db: ReturnType<typeof supabaseAdmin>,
  equipmentIds: number[],
  startDate: string | null,
  endDate: string | null,
  ignoreJobId?: number
) {
  if (!equipmentIds.length || !startDate || !endDate) return null;

  let jobsQuery = db
    .from("jobs")
    .select("id,job_name,start_date,end_date,job_equipment(equipment_id)")
    .not("start_date", "is", null)
    .not("end_date", "is", null)
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  if (ignoreJobId) jobsQuery = jobsQuery.neq("id", ignoreJobId);

  const { data, error } = await jobsQuery;
  if (error) return error.message;

  const conflict = (data || []).find((job: any) =>
    (job.job_equipment || []).some((item: any) => equipmentIds.includes(item.equipment_id))
  );

  return conflict ? `Equipment conflict with "${conflict.job_name}".` : null;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "Missing date range." }, { status: 400 });

  const db = supabaseAdmin();

  const [crewResult, equipmentResult, scheduledResult, incomingResult] = await Promise.all([
    db.from("crew").select("*").order("sort_order"),
    db.from("equipment").select("*").eq("active", true).order("sort_order"),
    db.from("jobs")
      .select("*, assignments(crew_id), job_equipment(equipment_id)")
      .not("start_date", "is", null)
      .not("end_date", "is", null)
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date"),
    db.from("jobs")
      .select("*, assignments(crew_id), job_equipment(equipment_id)")
      .is("start_date", null)
      .order("created_at", { ascending: false })
  ]);

  const firstError =
    crewResult.error || equipmentResult.error || scheduledResult.error || incomingResult.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  return NextResponse.json({
    crew: crewResult.data || [],
    equipment: equipmentResult.data || [],
    jobs: scheduledResult.data || [],
    incoming: incomingResult.data || []
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "supervisor") return forbidden();

  const body = await request.json();
  const db = supabaseAdmin();
  const crewIds: number[] = body.crewIds || [];
  const equipmentIds: number[] = body.equipmentIds || [];

  const conflict = await equipmentConflict(
    db, equipmentIds, body.start_date || null, body.end_date || null
  );
  if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });

  const { data, error } = await db.from("jobs").insert(cleanJob(body)).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (crewIds.length) {
    const result = await db.from("assignments").insert(
      crewIds.map(crew_id => ({ job_id: data.id, crew_id }))
    );
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  if (equipmentIds.length) {
    const result = await db.from("job_equipment").insert(
      equipmentIds.map(equipment_id => ({ job_id: data.id, equipment_id }))
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
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Missing job id." }, { status: 400 });

  const db = supabaseAdmin();
  const crewIds: number[] = body.crewIds || [];
  const equipmentIds: number[] = body.equipmentIds || [];

  const conflict = await equipmentConflict(
    db, equipmentIds, body.start_date || null, body.end_date || null, id
  );
  if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });

  const update = await db.from("jobs").update(cleanJob(body)).eq("id", id);
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 400 });

  const [clearCrew, clearEquipment] = await Promise.all([
    db.from("assignments").delete().eq("job_id", id),
    db.from("job_equipment").delete().eq("job_id", id)
  ]);

  if (clearCrew.error) return NextResponse.json({ error: clearCrew.error.message }, { status: 400 });
  if (clearEquipment.error) return NextResponse.json({ error: clearEquipment.error.message }, { status: 400 });

  if (crewIds.length) {
    const assigned = await db.from("assignments").insert(
      crewIds.map(crew_id => ({ job_id: id, crew_id }))
    );
    if (assigned.error) return NextResponse.json({ error: assigned.error.message }, { status: 400 });
  }

  if (equipmentIds.length) {
    const assigned = await db.from("job_equipment").insert(
      equipmentIds.map(equipment_id => ({ job_id: id, equipment_id }))
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
