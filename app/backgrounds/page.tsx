"use client";

import { useEffect, useRef, useState } from "react";

export default function BackgroundsPage() {
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadImages() {
    const res = await fetch("/api/backgrounds");
    const data = await res.json();
    if (res.ok) setImages(data.images || []);
  }

  useEffect(() => {
    loadImages();
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

  return (
    <div className="container">
      <div className="greeting">Backgrounds</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Upload photos to rotate as the dashboard background.
      </div>

      <div className="card">
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
        <h2>{images.length} photo{images.length === 1 ? "" : "s"}</h2>
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
