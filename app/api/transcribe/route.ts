import { NextRequest, NextResponse } from "next/server";

// Voice input is transcribed server-side via Groq's hosted Whisper endpoint
// instead of the browser's built-in SpeechRecognition API. That built-in API
// doesn't exist in any iOS browser (Safari, Chrome-for-iOS, etc all run on
// Apple's WebKit engine, which never implemented it) -- so on an iPhone home
// screen PWA the old mic button silently did nothing. MediaRecorder (used on
// the client to capture the audio clip) IS supported on iOS Safari 14.3+, so
// this path works everywhere the app is actually used.
export async function POST(req: NextRequest) {
  try {
    const { audioBase64, mimeType } = await req.json();
    if (!audioBase64) {
      return NextResponse.json({ error: "No audio received" }, { status: 400 });
    }

    const buffer = Buffer.from(audioBase64, "base64");
    const ext = mimeType?.includes("webm") ? "webm" : mimeType?.includes("mp4") ? "mp4" : mimeType?.includes("ogg") ? "ogg" : "m4a";
    const blob = new Blob([buffer], { type: mimeType || "audio/mp4" });

    const form = new FormData();
    form.append("file", blob, `audio.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "json");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Transcription failed (${res.status}): ${text}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ text: (data.text || "").trim() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
