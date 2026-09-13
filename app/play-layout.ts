export type Card = {id:string;x:number|null;y:number|null;z:number|null};
export type Box = {x:number;y:number;width:number;height:number;z:number};
export function jitter(id:string) {let seed=2166136261;for(const c of id)seed=Math.imul(seed^c.charCodeAt(0),16777619);seed=Math.imul(seed^(seed>>>16),0x85ebca6b);seed=Math.imul(seed^(seed>>>13),0xc2b2ae35);return ((seed^(seed>>>16))>>>0)/4294967295;}
export function playLayout(questions:Card[],responses:(Card&{question_id:string})[],width:number,heights:Record<string,number>) {
 const boxes:Record<string,Box>={};const questionWidth=Math.max(180,Math.min(width*.18,280)),responseWidth=Math.min(width*.20,280),gap=28;
 const responseStart=Math.max(width*.29,questionWidth+width*.04+gap),columns=Math.max(1,Math.floor((width-responseStart-24)/(responseWidth+gap+12)));
 let top=40;
 const occupied:Box[]=[];
 const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width+20&&a.x+a.width+20>b.x&&a.y<b.y+b.height+20&&a.y+a.height+20>b.y;
 const place=(card:Card,box:Box)=>{
   let hit;while((hit=occupied.find(other=>overlaps(box,other))))box.y=hit.y+hit.height+gap;
   boxes[card.id]=box;occupied.push(box);return box;
 };
 // Compute automatic slots independently of saved drag coordinates. Moving one
 // card must not push its neighbours or change the following question groups.
 for(const question of questions){
   const q=place(question,{x:width*.04,y:top,width:questionWidth,height:heights[question.id]??150,z:question.z??1});
   let rowTop=top,bottom=Math.max(top+q.height,q.y+q.height);const linked=responses.filter(r=>r.question_id===question.id);
   linked.forEach((response,index)=>{const column=index%columns;if(column===0)rowTop=index===0?top:bottom+gap;
     const r=place(response,{x:responseStart+column*(responseWidth+gap+12)+jitter(response.id)*12,y:rowTop+12+jitter(response.id+'y')*78,width:responseWidth,height:heights[response.id]??responseWidth+90,z:response.z??2});bottom=Math.max(bottom,r.y+r.height);
   });
   top=bottom+64;
 }
 // Overlay only the moved cards after all automatic slots have been calculated.
 // Keep their original slots reserved, including after a reload. Manual overlap
 // is intentional: dragging is direct placement, not a global auto-arrange action.
 for(const card of [...questions,...responses])if(card.x!=null&&card.y!=null&&boxes[card.id]){
   const box=boxes[card.id];box.x=Math.min(Math.max(0,card.x*width/100),Math.max(0,width-box.width));box.y=Math.max(0,card.y);
 }
 return {boxes,height:Math.max(700,top,...Object.values(boxes).map(b=>b.y+b.height+40))};
}
