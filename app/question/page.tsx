"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { participantId } from "../participant-id";
import { readState,subscribeTables,supabase } from "../supabase";
export default function QuestionPage(){
 const [text,setText]=useState(""),[enabled,setEnabled]=useState(false),[status,setStatus]=useState("idle");
 useEffect(()=>{let alive=true;const refresh=()=>readState().then(s=>alive&&setEnabled(s.questions_enabled)).catch(()=>undefined);void refresh();const off=subscribeTables(refresh,["exhibit_state"]);return()=>{alive=false;off();};},[]);
 async function submit(){if(!text.trim())return;setStatus("sending");const {error}=await supabase.from("questions").insert({text:text.trim(),participant_id:participantId()});setStatus(error?"error":"sent");}
 if(status==="sent")return <main className="connect-page"><section className="connect-card connect-finished"><div>☺</div><Link href="/">돌아가기</Link></section></main>;
 if(!enabled)return <main className="connect-page"><section className="connect-card connect-finished"><p>지금은 질문을 받고 있지 않아요.</p><Link href="/">돌아가기</Link></section></main>;
 return <main className="connect-page"><section className="connect-card"><header className="connect-header"><span>2. 질문하기</span><Link href="/">닫기</Link></header><h1>질문을 남겨주세요.</h1><textarea value={text} onChange={e=>setText(e.target.value)} autoFocus/><button className="connect-next" disabled={!text.trim()||status==="sending"} onClick={submit}>{status==="sending"?"보내는 중…":"질문 보내기"}</button>{status==="error"&&<p className="connect-error">전송하지 못했어요. 다시 시도해주세요.</p>}</section></main>;
}
