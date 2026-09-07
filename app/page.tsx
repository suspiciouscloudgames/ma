"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { JAPANESE_LOCALE_ENABLED, QUESTION_FEATURES_ENABLED } from "./exhibit-features";
import { participantId } from "./participant-id";
import { preparePhoto } from "./photo-processing";

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "preparing" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [exhibitState, setExhibitState] = useState({ displayMode: "none", questionsEnabled: false, locale: "ja" as "ko" | "ja" });
  const exhibitVersionRef = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function refreshMode() {
      try {
        const response = await fetch("/api/exhibit-mode", { cache: "no-store" });
        if (!response.ok) throw new Error("mode unavailable");
        const data = (await response.json()) as { displayMode: string; questionsEnabled: boolean; locale: "ko" | "ja"; version: number };
        if (active && Number.isFinite(data.version) && data.version >= exhibitVersionRef.current) {
          exhibitVersionRef.current = data.version;
          setExhibitState(data);
        }
      } finally {
        if (active) timer = window.setTimeout(refreshMode, 1500);
      }
    }
    refreshMode();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const ja = JAPANESE_LOCALE_ENABLED && exhibitState.locale === "ja";

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(nextFile);
    setPreview(nextFile ? URL.createObjectURL(nextFile) : null);
    setStatus("idle");
    setErrorMessage("");
  }

  async function uploadWithRetry(pathname: string, blob: Blob, identity: string) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) try {
      return await upload(pathname, blob, { access: "public", handleUploadUrl: "/api/upload", clientPayload: identity });
    } catch (error) { lastError = error; }
    throw lastError;
  }

  async function sendPhoto() {
    if (!file) return;
    setStatus("preparing"); setErrorMessage("");
    try {
      const prepared = await preparePhoto(file);
      setStatus("sending");
      const identity = participantId();
      const id = `${Date.now()}-${crypto.randomUUID()}`;
      await uploadWithRetry(`thumbnails/${id}.jpg`, prepared.thumbnail, identity);
      await uploadWithRetry(`photos/${id}.jpg`, prepared.main, identity);
      setStatus("sent");
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "";
      setErrorMessage(message.includes("large") ? (ja ? "写真の容量が大きすぎます。別の写真を選んでください。" : "사진 용량이 너무 큽니다. 다른 사진을 선택해주세요.") : (ja ? "写真を処理または送信できませんでした。もう一度お試しください。" : "사진을 처리하거나 전송하지 못했습니다. 다시 시도해주세요."));
    }
  }

  return (
    <main className="upload-page">
      <section className="upload-card" aria-label="사진 전송">
        <input
          ref={inputRef}
          className="visually-hidden"
          id="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={choosePhoto}
        />

        {preview ? (
          <button className="preview-button" type="button" onClick={() => inputRef.current?.click()} aria-label="다른 사진 선택">
            {/* A local object URL is required to preview the selected phone photo. */}
            <img src={preview} alt="선택한 사진 미리보기" />
            <span>{ja ? "別の写真を選択" : "다른 사진 선택"}</span>
          </button>
        ) : (
          <label className="pick-button" htmlFor="photo">
            <span className="plus" aria-hidden="true">＋</span>
            {ja ? "写真ライブラリから選択" : "사진첩에서 선택"}
          </label>
        )}

        <button className="send-button" type="button" onClick={sendPhoto} disabled={!file || status === "preparing" || status === "sending"}>
          {status === "preparing" ? (ja ? "写真を準備中…" : "사진 준비 중…") : status === "sending" ? (ja ? "送信中…" : "보내는 중…") : (ja ? "スクリーンに送る" : "스크린으로 보내기")}
        </button>

        <div className="status" aria-live="polite">
          {status === "sent" && <p className="success" aria-label="전송 완료">☺</p>}
          {status === "error" && <p className="error">{errorMessage}</p>}
        </div>

        <Link className="wall-link" href="/gallery">{ja ? "共有アルバムを見る" : "공동 사진첩 목록 보기"}</Link>
        {QUESTION_FEATURES_ENABLED && <>
          {exhibitState.questionsEnabled ? (
            <Link className="sentence-link" href="/question">{ja ? "2. 質問する" : "2. 질문하기"}</Link>
          ) : (
            <button className="sentence-link disabled" type="button" disabled>{ja ? "2. 質問する" : "2. 질문하기"}</button>
          )}
          {exhibitState.displayMode === "play" ? (
            <Link className="path-link" href="/respond">{ja ? "3. 質問を選ぶ" : "3. 질문 선택하기"}</Link>
          ) : (
            <button className="path-link disabled" type="button" disabled>{ja ? "3. 質問を選ぶ" : "3. 질문 선택하기"}</button>
          )}
        </>}
      </section>
    </main>
  );
}
