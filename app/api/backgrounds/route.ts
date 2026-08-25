import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "backgrounds";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const urls = (data || [])
      .filter((f) => f.name && !f.name.startsWith("."))
      .map((f) => supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl);

    return NextResponse.json({ images: urls });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, filename, contentType } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const buffer = Buffer.from(imageBase64, "base64");
    const safeName = `${Date.now()}-${(filename || "photo.jpg").replace(/[^a-zA-Z0-9.\-_]/g, "")}`;

    const { error } = await supabase.storage.from(BUCKET).upload(safeName, buffer, {
      contentType: contentType || "image/jpeg",
      upsert: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const url = supabase.storage.from(BUCKET).getPublicUrl(safeName).data.publicUrl;
    return NextResponse.json({ url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
