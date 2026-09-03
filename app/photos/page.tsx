"use client";

import { useEffect, useRef, useState } from "react";

export default function PhotosPage() {
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pcCount, setPcCount] = useState(0);
  const [pcUploading, setPcUploading] = useState(false);
  const [pcError, setPcError] = useState<string | null>(null);
  const [pcRevealed, setPcRevealed] = useState<{ id: string; date: string; notes: string | null; url: string | null }[] | null>(null);
  const [pcRevealing, setPcRevealing] = useState(false);
  const pcFileInputRef = useRef<HTMLInputElement>(null);

  async function loadImages() {
    const res = await fetch("/api/backgrounds");
    const data = await res.json();
    if (res.ok) setImages(data.images || []);
  }

  async function loadProgressCount() {
    const res = await fetch("/api/progress-photos");
    const data = await res.json();
    if (res.ok) setPcCount(data.count || 0);
  }

  useEffect(() => {
    loadImages();
    loadProgressCount();
  }, []);

  async function handleFiles(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const base64 = await fileToBase64(file);
        const res = await fetch("/api/backgrounds", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, filename: file.name, contentType: file.type }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }
      }
      await loadImages();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  // Body Composition uploads go to a private bucket -- these never render as
  // thumbnails on this page. Only a count shows by default; viewing the
  // actual photos requires the separate "View photos" action below, which
  // fetches short-lived signed URLs on demand.
  async function handlePcFiles(files: FileList) {
    setPcUploading(true);
    setPcError(null);
    try {
      for (const file of Array.from(files)) {
        const base64 = await fileToBase64(file);
        const res = await fetch("/api/progress-photos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, filename: file.name, contentType: file.type }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }
      }
      await loadProgressCount();
      setPcRevealed(null);
    } catch (e: any) {
      setPcError(e.message);
    } finally {
      setPcUploading(false);
    }
  }

  async function revealProgressPhotos() {
    setPcRevealing(true);
    try {
      const res = await fetch("/api/progress-photos?reveal=1");
      const data = await res.json();
      if (res.ok) setPcRevealed(data.photos || []);
    } finally {
      setPcRevealing(false);
    }
  }

  return (
    <div className="container">
      <div className="greeting">Photos</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Backgrounds rotate on your dashboard. Body Composition photos stay private.
      </div>

      <div className="card">
        <h2>Backgrounds</h2>
        <div className="subtle" style={{ marginBottom: 12 }}>
          Upload photos to rotate as the dashboard background.
        </div>
        <button className="btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? "Uploading…" : "📸 Upload photos"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
          }}
        />
      </div>

      {error && (
        <div className="card" style={{ color: "#c0392b" }}>
          {error}
        </div>
      )}

      <div className="card">
        <h2>
          {images.length} photo{images.length === 1 ? "" : "s"}
        </h2>
        {images.length === 0 && <div className="empty">No backgrounds yet. Upload a few above.</div>}
        {images.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {images.map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 10 }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Body Composition</h2>
        <div className="subtle" style={{ marginBottom: 12 }}>
          Progress photos for comparing later -- kept private, never shown as thumbnails here.
        </div>
        <button className="btn" disabled={pcUploading} onClick={() => pcFileInputRef.current?.click()}>
          {pcUploading ? "Uploading…" : "🔒 Upload private photo"}
        </button>
        <input
          ref={pcFileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handlePcFiles(e.target.files);
          }}
        />
        {pcError && (
          <div style={{ color: "#c0392b", marginTop: 10, fontSize: 13 }}>{pcError}</div>
        )}
        <div className="subtle" style={{ marginTop: 14 }}>
          {pcCount} photo{pcCount === 1 ? "" : "s"} stored privately.
        </div>
        {pcCount > 0 && !pcRevealed && (
          <button
            className="btn btn-secondary"
            style={{ marginTop: 10 }}
            disabled={pcRevealing}
            onClick={revealProgressPhotos}
          >
            {pcRevealing ? "Loading…" : "View photos"}
          </button>
        )}
        {pcRevealed && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
              {pcRevealed.map((p) => (
                <img
                  key={p.id}
                  src={p.url ?? undefined}
                  alt=""
                  style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 10 }}
                />
              ))}
            </div>
            <button
              className="btn btn-secondary"
              style={{ marginTop: 10 }}
              onClick={() => setPcRevealed(null)}
            >
              Hide again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
