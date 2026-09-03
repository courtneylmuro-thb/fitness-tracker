import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "progress-photos";

// This bucket is private on purpose -- progress/physique photos are never
// listed as visible thumbnails the way Backgrounds are. GET only returns a
// count unless ?reveal=1 is explicitly passed, in which case it returns
// short-lived signed URLs (Courtney opting in each time she wants to look
// back at them, not a passive gallery).
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const reveal = req.nextUrl.searchParams.get("reveal") === "1";

    const { data, error } = await supabase.from("progress_photos")
      .select("id, date, storage_path, notes")
      .order("date", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!reveal) {
      return NextResponse.json({ count: data?.length ?? 0 });
    }

    const photos = await Promise.all(
      (data || []).map(async (row) => {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(row.storage_path, 60 * 5); // 5 min
        return { id: row.id, date: row.date, notes: row.notes, url: signed?.signedUrl ?? null };
      })
    );

    return NextResponse.json({ count: photos.length, photos });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, filename, contentType, date, notes } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const buffer = Buffer.from(imageBase64, "base64");
    const safeName = `${Date.now()}-${(filename || "photo.jpg").replace(/[^a-zA-Z0-9.\-_]/g, "")}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(safeName, buffer, {
      contentType: contentType || "image/jpeg",
      upsert: true,
    });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { error: dbError } = await supabase.from("progress_photos").insert({
      date: date || new Date().toISOString().slice(0, 10),
      storage_path: safeName,
      notes: notes || null,
    });
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
