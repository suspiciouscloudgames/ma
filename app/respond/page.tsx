'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { participantId } from '../participant-id';
import { publicPhotoUrl,subscribeTables,supabase } from '../supabase';
import { useDraft,useExhibitState,useSubmission,SubmissionStatus } from '../workshop-client';
type Q={id:string;text:string};type P={id:string;thumbnail_path:string};
export default function RespondPage(){
 const [step,setStep]=useDraft<1|2|3>('ma-response-step',1),[questions,setQuestions]=useState<Q[]>([]),[photos,setPhotos]=useState<P[]>([]),[qid,setQid]=useDraft<string|null>('ma-response-question',null),[text,setText]=useDraft('ma-response-text',''),[pid,setPid]=useDraft<string|null>('ma-response-photo',null);
 const state=useExhibitState(),en=state.locale==='en',submission=useSubmission('response');
 useEffect(()=>{let alive=true;const load=async()=>{const [q,p]=await Promise.all([supabase.from('questions').select('id,text').order('created_at').order('id'),supabase.from('photos').select('id,thumbnail_path').order('created_at').order('id')]);if(alive){if(!q.error)setQuestions((q.data??[])as Q[]);if(!p.error)setPhotos((p.data??[])as P[]);}};const off=subscribeTables(load,['questions','photos']);return()=>{alive=false;off();};},[]);
 async function submit(){if(!qid||!pid||!text.trim())return;if(await submission.submit({row:{question_id:qid,photo_id:pid,text:text.trim(),participant_id:participantId()}})){setText('');setQid(null);setPid(null);setStep(1);}}
 if(submission.state==='sent'||submission.busy||submission.state==='blocked')return <main className="connect-page"><section className="connect-card connect-finished"><SubmissionStatus state={submission.state} en={en}/>{submission.state==='sent'&&<button onClick={submission.reset}>{en?'Choose another question':'다른 질문 선택하기'}</button>}<Link href="/">{en?'Back':'돌아가기'}</Link></section></main>;
 if(state.display_mode!=='play')return <main className="connect-page"><section className="connect-card connect-finished"><p>{en?'Question selection is not open right now.':'지금은 질문 선택이 열려 있지 않아요.'}</p><Link href="/">{en?'Back':'돌아가기'}</Link></section></main>;
 return <main className="connect-page"><section className="connect-card"><header className="connect-header"><span>{step} / 3</span><Link href="/">{en?'Close':'닫기'}</Link></header>
 {step===1&&<><h1>{en?'Choose a question.':'질문을 선택하세요.'}</h1><div className="question-choice-list">{questions.map(q=><button key={q.id} className={qid===q.id?'selected':''} onClick={()=>setQid(q.id)}>{q.text}</button>)}</div><button className="connect-next" disabled={!questions.some(q=>q.id===qid)} onClick={()=>setStep(2)}>{en?'Next':'다음'}</button></>}
 {step===2&&<><h1>{en?'Write a sentence.':'문장을 입력하세요.'}</h1><p className="connect-sentence">{questions.find(q=>q.id===qid)?.text}</p><textarea value={text} maxLength={50000} onChange={e=>setText(e.target.value)} autoFocus/><div className="connect-footer"><button onClick={()=>setStep(1)}>{en?'Back':'이전'}</button><button disabled={!text.trim()} onClick={()=>setStep(3)}>{en?'Choose photo':'사진 선택'}</button></div></>}
 {step===3&&<><h1>{en?'Choose a photo.':'사진을 선택하세요.'}</h1><div className="connect-photos">{photos.map(p=><button key={p.id} className={pid===p.id?'selected':''} onClick={()=>setPid(p.id)}><img src={publicPhotoUrl(p.thumbnail_path)} alt={en?'Shared photo':'공동 사진'}/></button>)}</div><div className="connect-footer"><button onClick={()=>setStep(2)}>{en?'Back':'이전'}</button><button disabled={!photos.some(p=>p.id===pid)||!questions.some(q=>q.id===qid)||submission.busy} onClick={submit}>{en?'Send together':'함께 보내기'}</button></div></>}
 <SubmissionStatus state={submission.state} en={en}/></section></main>;
}
