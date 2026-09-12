'use client';
import Link from 'next/link';
import { participantId } from '../participant-id';
import { useDraft,useExhibitState,useSubmission,SubmissionStatus } from '../workshop-client';
export default function QuestionPage(){
 const [text,setText]=useDraft('ma-question-draft','');const state=useExhibitState(),submission=useSubmission('question'),en=state.locale==='en';
 async function submit(){if(!text.trim())return;if(await submission.submit({row:{text:text.trim(),participant_id:participantId()}}))setText('');}
 if(submission.state==='sent'||submission.busy||submission.state==='blocked')return <main className="connect-page"><section className="connect-card connect-finished"><SubmissionStatus state={submission.state} en={en}/>{submission.state==='sent'&&<button onClick={submission.reset}>{en?'Ask another question':'새 질문 쓰기'}</button>}<Link href="/">{en?'Back':'돌아가기'}</Link></section></main>;
 if(!state.questions_enabled)return <main className="connect-page"><section className="connect-card connect-finished"><p>{en?'Questions are not open right now.':'지금은 질문을 받고 있지 않아요.'}</p><Link href="/">{en?'Back':'돌아가기'}</Link></section></main>;
 return <main className="connect-page"><section className="connect-card"><header className="connect-header"><span>{en?'2. Ask a question':'2. 질문하기'}</span><Link href="/">{en?'Close':'닫기'}</Link></header><h1>{en?'Leave a question.':'질문을 남겨주세요.'}</h1><textarea value={text} maxLength={50000} onChange={e=>setText(e.target.value)} autoFocus/><button className="connect-next" disabled={!text.trim()||submission.busy} onClick={submit}>{en?'Send question':'질문 보내기'}</button><SubmissionStatus state={submission.state} en={en}/></section></main>;
}
