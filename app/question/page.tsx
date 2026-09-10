"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { participantId } from "../participant-id";
import { readState,subscribeTables,supabase } from "../supabase";
import { submitWithRetry } from "../retry-submit";
export default function QuestionPage(){
 const [text,setText]=useState(""),[enabled,setEnabled]=useState(false),[locale,setLocale]=useState<"ko"|"en">("ko"),[status,setStatus]=useState("idle");const en=locale==="en";
 useEffect(()=>{let alive=true;const refresh=()=>readState().then(s=>{if(alive){setEnabled(s.questions_enabled);setLocale(s.locale);}}).catch(()=>undefined);void refresh();const off=subscribeTables(refresh,["exhibit_state"]);return()=>{alive=false;off();};},[]);
 async function submit(){if(!text.trim())return;setStatus("sending");const id=crypto.randomUUID();try{await submitWithRetry(async()=>await supabase.from("questions").insert({id,text:text.trim(),participant_id:participantId()}));setStatus("sent");}catch{setStatus("idle");}}
 if(status==="sent")return <main className="connect-page"><section className="connect-card connect-finished"><div>☺</div><Link href="/">{en?"Back":"돌아가기"}</Link></section></main>;
 if(!enabled)return <main className="connect-page"><section className="connect-card connect-finished"><p>{en?"Questions are not open right now.":"지금은 질문을 받고 있지 않아요."}</p><Link href="/">{en?"Back":"돌아가기"}</Link></section></main>;
 return <main className="connect-page"><section className="connect-card"><header className="connect-header"><span>{en?"2. Ask a question":"2. 질문하기"}</span><Link href="/">{en?"Close":"닫기"}</Link></header><h1>{en?"Leave a question.":"질문을 남겨주세요."}</h1><textarea value={text} onChange={e=>setText(e.target.value)} autoFocus/><button className="connect-next" disabled={!text.trim()||status==="sending"} onClick={submit}>{status==="sending"?(en?"Sending…":"보내는 중…"):(en?"Send question":"질문 보내기")}</button></section></main>;
}
