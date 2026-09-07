"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Photo = { key: string; url: string; thumbnailUrl: string; uploadedAt: string };
type Association = { id: string; photoKey: string; text: string; keywords: string[]; createdAt: string };
type OwnedAssociation = { id: string; editToken: string };
const OWNED_KEY = "mobile-archaeology-owned-associations";

export default function ConnectPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [connectionEnabled, setConnectionEnabled] = useState(true);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [owned, setOwned] = useState<OwnedAssociation[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(OWNED_KEY) ?? "[]") as OwnedAssociation[];
    } catch {
      return [];
    }
  });
  const [showMine, setShowMine] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/photos", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/associations", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/connection-mode", { cache: "no-store" }).then((response) => response.json()),
    ])
      .then(([photoData, associationData, modeData]: [{ photos: Photo[] }, { associations: Association[] }, { enabled: boolean }]) => {
        setPhotos(photoData.photos);
        setAssociations(associationData.associations);
        setDrafts(Object.fromEntries(associationData.associations.map((item) => [item.id, item.text])));
        setConnectionEnabled(modeData.enabled);
      })
      .catch(() => setStatus("error"));
  }, []);

  async function submit() {
    if (!selectedKey || !text.trim()) return;
    setStatus("sending");
    try {
      const response = await fetch("/api/associations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoKey: selectedKey, text }),
      });
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as { association: Association; editToken: string };
      const nextOwned = [...owned, { id: data.association.id, editToken: data.editToken }];
      localStorage.setItem(OWNED_KEY, JSON.stringify(nextOwned));
      setOwned(nextOwned);
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  async function saveSentence(id: string) {
    const permission = owned.find((item) => item.id === id);
    const nextText = drafts[id]?.trim();
    if (!permission || !nextText) return;
    setSavingId(id);
    try {
      const response = await fetch("/api/associations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, text: nextText, editToken: permission.editToken }),
      });
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as { association: Association };
      setAssociations((current) => current.map((item) => item.id === id ? data.association : item));
    } catch {
      setStatus("error");
    } finally {
      setSavingId(null);
    }
  }

  if (status === "sent") {
    return (
      <main className="connect-page">
        <section className="connect-card connect-finished">
          <div aria-label="전송 완료">☺</div>
          <Link href="/">돌아가기</Link>
        </section>
      </main>
    );
  }

  if (showMine) {
    const mine = associations.filter((association) => owned.some((item) => item.id === association.id));
    return (
      <main className="connect-page">
        <section className="connect-card">
          <header className="connect-header">
            <button type="button" onClick={() => setShowMine(false)}>돌아가기</button>
            <Link href="/">닫기</Link>
          </header>
          <h1>내가 남긴 문장</h1>
          {mine.length ? (
            <div className="my-sentences">
              {mine.map((association) => (
                <article key={association.id}>
                  <textarea
                    value={drafts[association.id] ?? association.text}
                    maxLength={300}
                    onChange={(event) => setDrafts((current) => ({ ...current, [association.id]: event.target.value }))}
                  />
                  <button type="button" onClick={() => saveSentence(association.id)} disabled={savingId === association.id}>
                    {savingId === association.id ? "저장 중…" : "수정 저장"}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="my-sentences-empty">이 휴대폰에서 남긴 문장이 없어요.</p>
          )}
        </section>
      </main>
    );
  }

  if (!connectionEnabled) {
    return (
      <main className="connect-page">
        <section className="connect-card connect-finished">
          <p>아직 문장과 사진 연결이 열리지 않았어요.</p>
          <Link href="/">돌아가기</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="connect-page">
      <section className="connect-card">
        <header className="connect-header">
          <span>{step} / 2</span>
          <Link href="/">닫기</Link>
        </header>

        {step === 1 ? (
          <>
            <h1>문장 입력</h1>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={300}
              placeholder="사진과 함께 남길 문장을 입력하세요."
              autoFocus
            />
            <button className="connect-next" type="button" disabled={!text.trim()} onClick={() => setStep(2)}>
              사진 선택하기
            </button>
            <button className="edit-mine-button" type="button" onClick={() => setShowMine(true)}>
              자기가 남긴 문장 수정하기
            </button>
          </>
        ) : (
          <>
            <h1>사진 한 장 선택</h1>
            <p className="connect-sentence">{text}</p>
            <div className="connect-photos">
              {photos.map((photo) => (
                <button
                  type="button"
                  key={photo.key}
                  className={selectedKey === photo.key ? "selected" : ""}
                  onClick={() => setSelectedKey(photo.key)}
                  aria-pressed={selectedKey === photo.key}
                >
                  <img src={photo.thumbnailUrl} alt="공동 사진" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
            <div className="connect-footer">
              <button type="button" onClick={() => setStep(1)}>이전</button>
              <button type="button" disabled={!selectedKey || status === "sending"} onClick={submit}>
                {status === "sending" ? "보내는 중…" : "연결해서 보내기"}
              </button>
            </div>
            {status === "error" && <p className="connect-error">전송하지 못했어요. 다시 시도해주세요.</p>}
          </>
        )}
      </section>
    </main>
  );
}
