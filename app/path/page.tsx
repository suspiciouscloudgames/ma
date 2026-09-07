"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Photo = { key: string; url: string; thumbnailUrl: string; uploadedAt: string };
type Association = { id: string; photoKey: string; text: string; keywords: string[]; createdAt: string };
type OwnedAssociation = { id: string; editToken: string };

const OWNED_KEY = "mobile-archaeology-owned-associations";
const PARTICIPANT_KEY = "mobile-archaeology-participant";
const COLORS = ["#d1495b", "#00798c", "#edae49", "#30638e", "#6a4c93", "#2a9d8f", "#e76f51", "#5f6f52", "#c44536", "#4f6d7a"];

function participantIdentity() {
  const saved = localStorage.getItem(PARTICIPANT_KEY);
  if (saved) {
    try {
      return JSON.parse(saved) as { id: string; color: string };
    } catch {
      localStorage.removeItem(PARTICIPANT_KEY);
    }
  }
  const identity = {
    id: crypto.randomUUID(),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
  localStorage.setItem(PARTICIPANT_KEY, JSON.stringify(identity));
  return identity;
}

export default function PathPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [owned] = useState<OwnedAssociation[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(OWNED_KEY) ?? "[]") as OwnedAssociation[];
    } catch {
      return [];
    }
  });
  const [identity] = useState<{ id: string; color: string } | null>(() => typeof window === "undefined" ? null : participantIdentity());
  const [selected, setSelected] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<"loading" | "idle" | "sending" | "sent" | "error">("loading");

  useEffect(() => {
    Promise.all([
      fetch("/api/photos", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/associations", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/path-mode", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([photoData, associationData, modeData]: [{ photos: Photo[] }, { associations: Association[] }, { enabled: boolean }]) => {
      setPhotos(photoData.photos);
      setAssociations(associationData.associations);
      setEnabled(modeData.enabled);
      setStatus("idle");
    }).catch(() => setStatus("error"));
  }, []);

  const candidates = useMemo(() => {
    const mine = associations.filter((association) => owned.some((item) => item.id === association.id));
    const myPhotoKeys = new Set(mine.map((association) => association.photoKey));
    const myKeywords = new Set(mine.flatMap((association) => association.keywords));
    const relatedKeys = new Set(
      associations
        .filter((association) => myPhotoKeys.has(association.photoKey) || association.keywords.some((keyword) => myKeywords.has(keyword)))
        .map((association) => association.photoKey),
    );
    return photos.filter((photo) => relatedKeys.has(photo.key));
  }, [associations, owned, photos]);

  function togglePhoto(key: string) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function completePath() {
    if (!identity || selected.length < 2) return;
    const proof = owned.find((item) => {
      const association = associations.find((candidate) => candidate.id === item.id);
      return association && selected.includes(association.photoKey);
    });
    if (!proof) {
      setStatus("error");
      return;
    }
    setStatus("sending");
    try {
      const response = await fetch("/api/paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: identity.id, color: identity.color, photoKeys: selected, associationId: proof.id, editToken: proof.editToken }),
      });
      if (!response.ok) throw new Error("failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return <main className="path-page"><section className="path-finished"><div>☺</div><p>경로를 보냈어요.</p><Link href="/">돌아가기</Link></section></main>;
  }
  if (!enabled) {
    return <main className="path-page"><section className="path-finished"><p>아직 경로 만들기가 열리지 않았어요.</p><Link href="/">돌아가기</Link></section></main>;
  }

  return (
    <main className="path-page">
      <section className="path-card">
        <header><span style={{ backgroundColor: identity?.color }} />내 경로<Link href="/">닫기</Link></header>
        <h1>사진을 순서대로 선택하세요.</h1>
        <p className="path-help">선택한 순서가 경로의 숫자가 됩니다. 다시 누르면 선택이 취소됩니다.</p>
        {status === "loading" ? <p className="path-empty">불러오는 중…</p> : candidates.length ? (
          <div className="path-candidates">
            {candidates.map((photo) => {
              const order = selected.indexOf(photo.key);
              return (
                <button type="button" key={photo.key} className={order >= 0 ? "selected" : ""} onClick={() => togglePhoto(photo.key)}>
                  <img src={photo.thumbnailUrl} alt="경로 후보 사진" loading="lazy" decoding="async" />
                  {order >= 0 && <b style={{ backgroundColor: identity?.color }}>{order + 1}</b>}
                </button>
              );
            })}
          </div>
        ) : <p className="path-empty">이 휴대폰에서 남긴 문장과 연결된 사진이 없어요.</p>}
        <button className="path-complete" type="button" disabled={selected.length < 2 || status === "sending"} onClick={completePath}>
          {status === "sending" ? "보내는 중…" : `완료 (${selected.length})`}
        </button>
        {status === "error" && <p className="connect-error">경로를 보내지 못했어요. 다시 시도해주세요.</p>}
      </section>
    </main>
  );
}
