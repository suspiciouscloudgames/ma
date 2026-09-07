"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { participantId } from "../participant-id";
import { JAPANESE_LOCALE_ENABLED } from "../exhibit-features";
import { postJsonWithRetry } from "../retry-fetch";

type Question = { id: string; text: string; createdAt: string };
type Photo = { key: string; url: string; thumbnailUrl: string; uploadedAt: string };

export default function RespondPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [enabled, setEnabled] = useState(false);
  const [locale, setLocale] = useState<"ko" | "ja">("ja");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const modeVersionRef = useRef(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/questions", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/photos", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([questionData, photoData]: [{ questions: Question[] }, { photos: Photo[] }]) => {
      setQuestions(questionData.questions); setPhotos(photoData.photos);
    }).catch(() => setStatus("error"));
    let active = true; let timer: number | undefined;
    async function refreshMode() {
      try {
        const response = await fetch("/api/exhibit-mode", { cache: "no-store" });
        if (!response.ok) throw new Error("mode unavailable");
        const mode = (await response.json()) as { displayMode: string; locale: "ko" | "ja"; version: number };
        if (active && Number.isFinite(mode.version) && mode.version >= modeVersionRef.current) {
          modeVersionRef.current = mode.version; setEnabled(mode.displayMode === "play"); setLocale(mode.locale);
        }
      } catch { /* Keep the last confirmed state. */ }
      finally { if (active) timer = window.setTimeout(refreshMode, 1500); }
    }
    refreshMode();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, []);
  const ja = JAPANESE_LOCALE_ENABLED && locale === "ja";

  async function submit() {
    if (!questionId || !text.trim() || !photoKey) return;
    setStatus("sending");
    try {
      const response = await postJsonWithRetry("/api/question-responses", { questionId, text, photoKey, participantId: participantId(), submissionId: crypto.randomUUID() });
      if (!response.ok) throw new Error("failed");
      setStatus("sent");
    } catch { setStatus("error"); }
  }

  if (status === "sent") return <main className="connect-page"><section className="connect-card connect-finished"><div>☺</div><Link href="/">{ja ? "戻る" : "돌아가기"}</Link></section></main>;
  if (!enabled) return <main className="connect-page"><section className="connect-card connect-finished"><p>{ja ? "現在、質問を選択できません。" : "지금은 질문 선택이 열려 있지 않아요."}</p><Link href="/">{ja ? "戻る" : "돌아가기"}</Link></section></main>;
  return (
    <main className="connect-page"><section className="connect-card">
      <header className="connect-header"><span>{step} / 3</span><Link href="/">{ja ? "閉じる" : "닫기"}</Link></header>
      {step === 1 && <><h1>{ja ? "質問を選んでください。" : "질문을 선택하세요."}</h1><div className="question-choice-list">
        {questions.map((question) => <button key={question.id} type="button" className={questionId === question.id ? "selected" : ""} onClick={() => setQuestionId(question.id)}>{question.text}</button>)}
      </div><button className="connect-next" disabled={!questionId} onClick={() => setStep(2)}>{ja ? "次へ" : "다음"}</button></>}
      {step === 2 && <><h1>{ja ? "文章を入力してください。" : "문장을 입력하세요."}</h1><p className="connect-sentence">{questions.find((q) => q.id === questionId)?.text}</p>
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={ja ? "選んだ質問に送る文章を入力してください。" : "선택한 질문에 보낼 문장을 입력하세요."} autoFocus />
        <div className="connect-footer"><button onClick={() => setStep(1)}>{ja ? "戻る" : "이전"}</button><button disabled={!text.trim()} onClick={() => setStep(3)}>{ja ? "写真を選ぶ" : "사진 선택"}</button></div></>}
      {step === 3 && <><h1>{ja ? "写真を選んでください。" : "사진을 선택하세요."}</h1><div className="connect-photos">{photos.map((photo) => <button key={photo.key} type="button" className={photoKey === photo.key ? "selected" : ""} onClick={() => setPhotoKey(photo.key)}><img src={photo.thumbnailUrl} alt={ja ? "共有写真" : "공동 사진"} loading="lazy" decoding="async" /></button>)}</div>
        <div className="connect-footer"><button onClick={() => setStep(2)}>{ja ? "戻る" : "이전"}</button><button disabled={!photoKey || status === "sending"} onClick={submit}>{status === "sending" ? (ja ? "送信中…" : "보내는 중…") : (ja ? "一緒に送る" : "함께 보내기")}</button></div></>}
      {status === "error" && <p className="connect-error">{ja ? "送信できませんでした。もう一度お試しください。" : "전송하지 못했어요. 다시 시도해주세요."}</p>}
    </section></main>
  );
}
