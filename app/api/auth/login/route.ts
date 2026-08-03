import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data, error } = await db
      .from("app_users")
      .select("id,email,password_hash,role,active")
      .eq("email", String(email).trim().toLowerCase())
      .single();

    if (error || !data || !data.active) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, data.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await setSessionCookie({ id: data.id, email: data.email, role: data.role });
    return NextResponse.json({ user: { id: data.id, email: data.email, role: data.role } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
