"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { JAPANESE_LOCALE_ENABLED, QUESTION_FEATURES_ENABLED } from "../exhibit-features";

type DisplayMode = "none" | "photos" | "play";
type Photo = { key: string; url: string; thumbnailUrl: string; uploadedAt: string };
type Position = { x: number; y: number; z: number; v?: number };
type Layout = Record<string, Position>;
type Question = { id: string; text: string; createdAt: string };
type QuestionResponse = { id: string; questionId: string; text: string; photoKey: string; createdAt: string };
type DragState = { kind: "photo" | "question" | "response"; id: string; offsetX: number; offsetY: number };
type ConnectionPath = { id: string; d: string };
type Locale = "ko" | "ja";

const UPLOAD_URL = "https://m-noticing.vercel.app/";

export default function GalleryPage() {
  const [locale, setLocale] = useState<Locale>("ja");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("none");
  const [questionsEnabled, setQuestionsEnabled] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoLayout, setPhotoLayout] = useState<Layout>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionLayout, setQuestionLayout] = useState<Layout>({});
  const [responses, setResponses] = useState<QuestionResponse[]>([]);
  const [responseLayout, setResponseLayout] = useState<Layout>({});
  const [qrExpanded, setQrExpanded] = useState(false);
  const [changingMode, setChangingMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [connectionPaths, setConnectionPaths] = useState<ConnectionPath[]>([]);
  const canvasRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const photoLayoutRef = useRef<Layout>({});
  const questionLayoutRef = useRef<Layout>({});
  const responseLayoutRef = useRef<Layout>({});
  const locallyMovedPhotos = useRef<Layout>({});
  const locallyMovedQuestions = useRef<Layout>({});
  const locallyMovedResponses = useRef<Layout>({});
  const exhibitVersionRef = useRef(0);
  const ja = JAPANESE_LOCALE_ENABLED && locale === "ja";

  useEffect(() => {
    document.title = ja ? "けはいのあそび" : "기척의 놀이";
  }, [ja]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function refresh() {
      try {
        const getJson = async (url: string) => {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) throw new Error(`refresh failed: ${url}`);
          return response.json();
        };
        const [modeResult, photoResult, questionResult, responseResult] = await Promise.all([
          getJson("/api/exhibit-mode"), getJson("/api/photos"), getJson("/api/questions"), getJson("/api/question-responses"),
        ]) as [{ displayMode: DisplayMode; questionsEnabled: boolean; locale: Locale; version: number }, { photos: Photo[]; layout: Layout }, { questions: Question[]; layout: Layout }, { responses: QuestionResponse[]; layout: Layout }];
        if (!active || !Array.isArray(photoResult.photos) || !Array.isArray(questionResult.questions) || !Array.isArray(responseResult.responses)) return;
        const nextPhotoLayout = { ...photoResult.layout, ...locallyMovedPhotos.current };
        const nextQuestionLayout = { ...questionResult.layout, ...locallyMovedQuestions.current };
        const nextResponseLayout = { ...responseResult.layout, ...locallyMovedResponses.current };
        if (modeResult.version >= exhibitVersionRef.current) {
          exhibitVersionRef.current = modeResult.version;
          setDisplayMode(modeResult.displayMode); setQuestionsEnabled(modeResult.questionsEnabled); setLocale(modeResult.locale);
        }
        setPhotos(photoResult.photos); setQuestions(questionResult.questions); setResponses(responseResult.responses);
        photoLayoutRef.current = nextPhotoLayout; questionLayoutRef.current = nextQuestionLayout; responseLayoutRef.current = nextResponseLayout;
        setPhotoLayout(nextPhotoLayout); setQuestionLayout(nextQuestionLayout); setResponseLayout(nextResponseLayout);
      } finally {
        if (active) timer = window.setTimeout(refresh, 2000);
      }
    }
    refresh();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, []);

  function defaultPhotoPosition(index: number): Position {
    return { x: (index % 4) * 25.3, y: Math.floor(index / 4) * 380 + 30, z: index + 1, v: 2 };
  }
  function defaultQuestionPosition(index: number): Position {
    return { x: 8 + (index % 3) * 31, y: 90 + Math.floor(index / 3) * 560, z: index + 1 };
  }

  async function changeState(change: { displayMode?: DisplayMode; questionsEnabled?: boolean; locale?: Locale }) {
    let adminKey = sessionStorage.getItem("mobile-archaeology-admin-key") ?? "";
    if (!adminKey) adminKey = window.prompt(ja ? "管理者パスワードを入力してください。" : "관리자 암호를 입력하세요.")?.trim() ?? "";
    if (!adminKey) return;
    setChangingMode(true);
    try {
      const response = await fetch("/api/exhibit-mode", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          displayMode: change.displayMode ?? displayMode,
          questionsEnabled: change.questionsEnabled ?? questionsEnabled,
          locale: change.locale ?? locale,
          adminKey,
        }),
      });
      if (response.status === 403) {
        sessionStorage.removeItem("mobile-archaeology-admin-key"); window.alert(ja ? "管理者パスワードが正しくありません。" : "관리자 암호가 맞지 않습니다."); return;
      }
      if (!response.ok) throw new Error("failed");
      const next = (await response.json()) as { displayMode: DisplayMode; questionsEnabled: boolean; locale: Locale; version: number };
      exhibitVersionRef.current = next.version;
      sessionStorage.setItem("mobile-archaeology-admin-key", adminKey); setDisplayMode(next.displayMode); setQuestionsEnabled(next.questionsEnabled); setLocale(next.locale);
    } catch { window.alert(ja ? "画面の状態を変更できませんでした。" : "화면 상태를 변경하지 못했습니다."); }
    finally { setChangingMode(false); }
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>, kind: "photo" | "question" | "response", id: string, index: number, fallbackPosition?: Position) {
    if (window.innerWidth <= 760 || (event.target as HTMLElement).closest("button")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const layout = kind === "photo" ? photoLayoutRef.current : kind === "question" ? questionLayoutRef.current : responseLayoutRef.current;
    const fallback = fallbackPosition ?? (kind === "photo" ? defaultPhotoPosition(index) : defaultQuestionPosition(index));
    const highestZ = Math.max(0, ...Object.values(layout).map((item) => item.z));
    const next = { ...layout, [id]: { ...(layout[id] ?? fallback), z: highestZ + 1 } };
    if (kind === "photo") { photoLayoutRef.current = next; setPhotoLayout(next); }
    else if (kind === "question") { questionLayoutRef.current = next; setQuestionLayout(next); }
    else { responseLayoutRef.current = next; setResponseLayout(next); }
    dragRef.current = { kind, id, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    setDraggedId(id); event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current; const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const canvasRect = canvas.getBoundingClientRect(); const itemRect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100 - itemRect.width / canvasRect.width * 100, (event.clientX - canvasRect.left - drag.offsetX) / canvasRect.width * 100));
    const y = Math.max(0, event.clientY - canvasRect.top - drag.offsetY);
    const source = drag.kind === "photo" ? photoLayoutRef.current : drag.kind === "question" ? questionLayoutRef.current : responseLayoutRef.current;
    const next = { ...source, [drag.id]: { ...source[drag.id], x, y } };
    if (drag.kind === "photo") { photoLayoutRef.current = next; locallyMovedPhotos.current = { ...locallyMovedPhotos.current, [drag.id]: next[drag.id] }; setPhotoLayout(next); }
    else if (drag.kind === "question") { questionLayoutRef.current = next; locallyMovedQuestions.current = { ...locallyMovedQuestions.current, [drag.id]: next[drag.id] }; setQuestionLayout(next); }
    else { responseLayoutRef.current = next; locallyMovedResponses.current = { ...locallyMovedResponses.current, [drag.id]: next[drag.id] }; setResponseLayout(next); }
  }

  async function finishDrag() {
    const drag = dragRef.current; if (!drag) return;
    dragRef.current = null; setDraggedId(null);
    const adminKey = sessionStorage.getItem("mobile-archaeology-admin-key") ?? "";
    const position = drag.kind === "photo" ? photoLayoutRef.current[drag.id] : drag.kind === "question" ? questionLayoutRef.current[drag.id] : responseLayoutRef.current[drag.id];
    const url = drag.kind === "photo" ? "/api/photos" : drag.kind === "question" ? "/api/questions" : "/api/question-responses";
    const body = { layoutPatch: { [drag.id]: position }, adminKey };
    try { await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); } catch { /* next poll keeps the local position */ }
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm(ja ? "この写真を削除しますか？" : "이 사진을 삭제할까요?")) return;
    const key = adminKey(); if (!key) return;
    const response = await fetch("/api/photos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: photo.key, adminKey: key }) });
    if (response.status === 403) { sessionStorage.removeItem("mobile-archaeology-admin-key"); window.alert(ja ? "管理者パスワードが正しくありません。" : "관리자 암호가 맞지 않습니다."); return; }
    if (response.ok) sessionStorage.setItem("mobile-archaeology-admin-key", key);
    if (response.ok) setPhotos((current) => current.filter((item) => item.key !== photo.key));
  }

  function adminKey() {
    let key = sessionStorage.getItem("mobile-archaeology-admin-key") ?? "";
    if (!key) key = window.prompt(ja ? "管理者パスワードを入力してください。" : "관리자 암호를 입력하세요.")?.trim() ?? "";
    return key;
  }

  async function deleteQuestion(question: Question) {
    if (!window.confirm(ja ? "この質問と、接続されているすべての画像・文章を削除しますか？" : "이 질문과 연결된 모든 이미지·문장을 삭제할까요?")) return;
    const key = adminKey(); if (!key) return;
    const response = await fetch("/api/questions", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: question.id, adminKey: key }),
    });
    if (response.status === 403) { sessionStorage.removeItem("mobile-archaeology-admin-key"); window.alert(ja ? "管理者パスワードが正しくありません。" : "관리자 암호가 맞지 않습니다."); return; }
    if (!response.ok) { window.alert(ja ? "質問を削除できませんでした。" : "질문을 삭제하지 못했습니다."); return; }
    sessionStorage.setItem("mobile-archaeology-admin-key", key);
    setQuestions((current) => current.filter((item) => item.id !== question.id));
    setResponses((current) => current.filter((item) => item.questionId !== question.id));
  }

  async function deleteResponse(item: QuestionResponse) {
    if (!window.confirm(ja ? "この画像と文章の組み合わせを削除しますか？" : "이 이미지와 문장 조합을 삭제할까요?")) return;
    const key = adminKey(); if (!key) return;
    const response = await fetch("/api/question-responses", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, adminKey: key }),
    });
    if (response.status === 403) { sessionStorage.removeItem("mobile-archaeology-admin-key"); window.alert(ja ? "管理者パスワードが正しくありません。" : "관리자 암호가 맞지 않습니다."); return; }
    if (!response.ok) { window.alert(ja ? "画像と文章を削除できませんでした。" : "이미지와 문장을 삭제하지 못했습니다."); return; }
    sessionStorage.setItem("mobile-archaeology-admin-key", key);
    setResponses((current) => current.filter((responseItem) => responseItem.id !== item.id));
  }

  const photoByKey = useMemo(() => new Map(photos.map((photo) => [photo.key, photo])), [photos]);
  const responseGeometry = useMemo(() => {
    const result: Layout = {};
    questions.forEach((question, questionIndex) => {
      const origin = questionLayout[question.id] ?? defaultQuestionPosition(questionIndex);
      const linked = responses.filter((item) => item.questionId === question.id);
      linked.forEach((response, index) => {
        const side = index % 2 === 0 ? 1 : -1;
        const tier = Math.floor(index / 2);
        result[response.id] = responseLayout[response.id] ?? {
          x: Math.max(1, Math.min(78, origin.x + side * (20 + tier * 5))),
          y: Math.max(15, origin.y + 130 + tier * 235),
          z: index + 1,
        };
      });
    });
    return result;
  }, [questionLayout, questions, responseLayout, responses]);

  const updateConnectionPaths = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || displayMode !== "play") { setConnectionPaths([]); return; }
    const canvasRect = canvas.getBoundingClientRect();
    function boundary(rect: DOMRect, targetX: number, targetY: number) {
      const centerX = rect.left - canvasRect.left + rect.width / 2;
      const centerY = rect.top - canvasRect.top + rect.height / 2;
      const dx = targetX - centerX; const dy = targetY - centerY;
      const scale = 1 / Math.max(Math.abs(dx) / Math.max(rect.width / 2, 1), Math.abs(dy) / Math.max(rect.height / 2, 1), .0001);
      return { x: centerX + dx * scale, y: centerY + dy * scale, centerX, centerY };
    }
    const paths = responses.flatMap((item) => {
      const question = canvas.querySelector<HTMLElement>(`[data-question-id="${CSS.escape(item.questionId)}"]`);
      const response = canvas.querySelector<HTMLElement>(`[data-response-id="${CSS.escape(item.id)}"]`);
      if (!question || !response) return [];
      const qRect = question.getBoundingClientRect(); const rRect = response.getBoundingClientRect();
      const qCenter = { x: qRect.left - canvasRect.left + qRect.width / 2, y: qRect.top - canvasRect.top + qRect.height / 2 };
      const rCenter = { x: rRect.left - canvasRect.left + rRect.width / 2, y: rRect.top - canvasRect.top + rRect.height / 2 };
      const start = boundary(qRect, rCenter.x, rCenter.y); const end = boundary(rRect, qCenter.x, qCenter.y);
      const bend = Math.max(36, Math.min(150, Math.abs(end.x - start.x) * .36));
      const direction = end.x >= start.x ? 1 : -1;
      return [{ id: item.id, d: `M ${start.x} ${start.y} C ${start.x + bend * direction} ${start.y}, ${end.x - bend * direction} ${end.y}, ${end.x} ${end.y}` }];
    });
    setConnectionPaths(paths);
  }, [displayMode, responses]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(updateConnectionPaths);
    window.addEventListener("resize", updateConnectionPaths);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", updateConnectionPaths); };
  }, [questionLayout, responseGeometry, updateConnectionPaths]);

  const canvasHeight = displayMode === "photos"
    ? Math.max(1000, Math.ceil(photos.length / 4) * 420)
    : Math.max(1000, ...questions.map((question, index) => (questionLayout[question.id] ?? defaultQuestionPosition(index)).y + 520), ...Object.values(responseGeometry).map((item) => item.y + 300));

  return (
    <main className="gallery-page exhibit-page">
      <header className="gallery-header exhibit-header">
        <div className="gallery-title"><h1>{ja ? "けはいのあそび" : "기척의 놀이"}</h1><p>{ja ? "写真を長押しして選択し、保存してください。" : "사진을 길게 눌러 선택하고 저장하세요."}</p></div>
        <Link className="gallery-back" href={UPLOAD_URL}>{ja ? "戻る" : "돌아가기"}</Link>
        <div className="exhibit-controls">
          <div className="language-switch" aria-label={ja ? "言語選択" : "언어 선택"}>
            <button className={!ja ? "active" : ""} type="button" disabled={changingMode} onClick={() => changeState({ locale: "ko" })}>KO</button>
            {JAPANESE_LOCALE_ENABLED && <button className={ja ? "active" : ""} type="button" disabled={changingMode} onClick={() => changeState({ locale: "ja" })}>JP</button>}
          </div>
          <nav className="exhibit-modes" aria-label={ja ? "共有画面モード" : "공동 화면 모드"}>
            <button className={displayMode === "photos" ? "active" : ""} disabled={changingMode} onClick={() => changeState({ displayMode: displayMode === "photos" ? "none" : "photos" })}>{ja ? "1. モバイル考古学" : "1. 모바일 고고학"}</button>
            {QUESTION_FEATURES_ENABLED && <>
              <button className={questionsEnabled ? "active" : ""} disabled={changingMode} onClick={() => changeState({ questionsEnabled: !questionsEnabled })}>{ja ? "2. 質問" : "2. 질문"}</button>
              <button className={displayMode === "play" ? "active" : ""} disabled={changingMode} onClick={() => changeState({ displayMode: displayMode === "play" ? "none" : "play" })}>{ja ? "3. けはいのあそび" : "3. 기척의 놀이"}</button>
            </>}
          </nav>
        </div>
        <button className="gallery-qr" type="button" onClick={() => setQrExpanded(true)} aria-label="사진 전송 QR 코드 크게 보기">
          <QRCodeSVG value={UPLOAD_URL} title="모바일 접속 QR 코드" />
        </button>
      </header>

      {qrExpanded && <button className="qr-overlay" type="button" onClick={() => setQrExpanded(false)} aria-label="QR 코드 닫기">
        <QRCodeSVG value={UPLOAD_URL} title="모바일 접속 QR 코드" />
      </button>}

      {(displayMode === "photos" || displayMode === "play") && <section ref={canvasRef} className={`exhibit-canvas ${displayMode}`} style={{ minHeight: canvasHeight }}>
        {displayMode === "photos" && photos.map((photo, index) => {
          const position = photoLayout[photo.key] ?? defaultPhotoPosition(index);
          return <figure key={photo.key} className={`gallery-item${draggedId === photo.key ? " dragging" : ""}`} data-photo-key={photo.key}
            style={{ left: `${position.x}%`, top: position.y, zIndex: position.z }}
            onPointerDown={(event) => startDrag(event, "photo", photo.key, index)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
            <img src={photo.url} alt="공동 사진" draggable={false} loading="lazy" decoding="async" />
            <div className="photo-actions"><button type="button" onClick={() => deletePhoto(photo)} aria-label="사진 삭제">×</button></div>
          </figure>;
        })}

        {displayMode === "play" && <>
          <svg className="gallery-connections" aria-hidden="true">
            {connectionPaths.map((path) => <path key={path.id} d={path.d} />)}
          </svg>
          {questions.map((question, index) => {
            const position = questionLayout[question.id] ?? defaultQuestionPosition(index);
            return <article key={question.id} data-question-id={question.id} className={`question-node${draggedId === question.id ? " dragging" : ""}`}
              style={{ left: `${position.x}%`, top: position.y, zIndex: position.z + 100 }}
              onPointerDown={(event) => startDrag(event, "question", question.id, index)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
              <span>{question.text}</span><button className="node-delete" type="button" onClick={() => deleteQuestion(question)} aria-label="질문 삭제">×</button>
            </article>;
          })}
          {responses.map((response) => {
            const photo = photoByKey.get(response.photoKey); const position = responseGeometry[response.id];
            if (!photo || !position) return null;
            return <article key={response.id} data-response-id={response.id} className={`question-response-node${draggedId === response.id ? " dragging" : ""}`} style={{ left: `${position.x}%`, top: position.y, zIndex: position.z + 20 }}
              onPointerDown={(event) => startDrag(event, "response", response.id, 0, position)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
              <img src={photo.thumbnailUrl} alt="질문에 선택된 사진" draggable={false} loading="lazy" decoding="async" /><p>{response.text}</p><button className="node-delete" type="button" onClick={() => deleteResponse(response)} aria-label="이미지와 문장 삭제">×</button>
            </article>;
          })}
        </>}
      </section>}
      <section className="mobile-photo-list" aria-label="공동 사진첩 전체 사진 목록">
        {photos.map((photo) => <img key={photo.key} src={photo.thumbnailUrl} alt="공동 사진" loading="lazy" decoding="async" />)}
      </section>
    </main>
  );
}
