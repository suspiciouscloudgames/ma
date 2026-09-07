"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { participantId } from "../participant-id";
import { JAPANESE_LOCALE_ENABLED } from "../exhibit-features";
import { postJsonWithRetry } from "../retry-fetch";

export default function QuestionPage() {
  const [text, setText] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [modeLoaded, setModeLoaded] = useState(false);
  const [locale, setLocale] = useState<"ko" | "ja">("ja");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const modeVersionRef = useRef(0);

  useEffect(() => {
    let active = true; let timer: number | undefined;
    async function refresh() {
      try {
        const response = await fetch("/api/exhibit-mode", { cache: "no-store" });
        if (!response.ok) throw new Error("mode unavailable");
        const data = (await response.json()) as { questionsEnabled: boolean; locale: "ko" | "ja"; version: number };
        if (active && Number.isFinite(data.version) && data.version >= modeVersionRef.current) {
          modeVersionRef.current = data.version; setEnabled(data.questionsEnabled); setLocale(data.locale); setModeLoaded(true);
        }
      } catch { /* Keep the last confirmed state instead of closing the form. */ }
      finally { if (active) timer = window.setTimeout(refresh, 1500); }
    }
    refresh(); return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, []);
  const ja = JAPANESE_LOCALE_ENABLED && locale === "ja";

  async function submit() {
    if (!text.trim()) return;
    setStatus("sending");
    try {
      const response = await postJsonWithRetry("/api/questions", { text, participantId: participantId(), submissionId: crypto.randomUUID() });
      if (!response.ok) throw new Error("failed");
      setStatus("sent");
    } catch { setStatus("error"); }
  }

  if (status === "sent") return (
    <main className="connect-page"><section className="connect-card connect-finished">
      <div aria-label={ja ? "送信完了" : "전송 완료"}>☺</div><Link href="/">{ja ? "戻る" : "돌아가기"}</Link>
    </section></main>
  );
  if (!modeLoaded) return (
    <main className="connect-page"><section className="connect-card connect-finished">
      <p>{ja ? "接続中…" : "연결 중…"}</p>
    </section></main>
  );
  if (!enabled) return (
    <main className="connect-page"><section className="connect-card connect-finished">
      <p>{ja ? "現在、質問の受付は停止しています。" : "지금은 질문을 받고 있지 않아요."}</p><Link href="/">{ja ? "戻る" : "돌아가기"}</Link>
    </section></main>
  );
  return (
    <main className="connect-page"><section className="connect-card">
      <header className="connect-header"><span>{ja ? "2. 質問する" : "2. 질문하기"}</span><Link href="/">{ja ? "閉じる" : "닫기"}</Link></header>
      <h1>{ja ? "質問を入力してください。" : "질문을 남겨주세요."}</h1>
      <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={ja ? "質問を入力してください。" : "질문을 입력하세요."} autoFocus />
      <button className="connect-next" type="button" disabled={!text.trim() || status === "sending"} onClick={submit}>
        {status === "sending" ? (ja ? "送信中…" : "보내는 중…") : (ja ? "質問を送る" : "질문 보내기")}
      </button>
      {status === "error" && <p className="connect-error">{ja ? "送信できませんでした。もう一度お試しください。" : "전송하지 못했어요. 다시 시도해주세요."}</p>}
    </section></main>
  );
}
