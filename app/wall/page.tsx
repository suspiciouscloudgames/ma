"use client";

import { useEffect, useState } from "react";

type Photo = { key: string; url: string; thumbnailUrl: string; uploadedAt: string };

export default function WallPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/photos", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { photos: Photo[] };
        if (active) setPhotos(data.photos);
      } finally {
        if (active) setLoaded(true);
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return (
    <main className="wall-page">
      <header className="wall-header">
        <h1>우리의 사진들</h1>
        <p>{photos.length}장의 순간이 모였어요</p>
      </header>
      {photos.length ? (
        <section className="photo-grid" aria-label="업로드된 사진 모음">
          {photos.map((photo) => (
            <figure className="photo-tile" key={photo.key}>
              <img src={photo.thumbnailUrl} alt="참여자가 공유한 사진" loading="lazy" decoding="async" />
            </figure>
          ))}
        </section>
      ) : (
        <div className="empty-wall">
          <p><strong>{loaded ? "첫 사진을 기다리고 있어요" : "사진을 불러오는 중이에요"}</strong>QR 코드를 스캔하고 사진을 보내주세요.</p>
        </div>
      )}
    </main>
  );
}
