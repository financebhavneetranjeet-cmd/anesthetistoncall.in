'use client';
import {useEffect,useRef,useState} from 'react';
type Action='availability'|'selection'|'acceptance'|'arrival'|'cancellation';
type Draft={number:string;message:string};
type FollowUp={opened:boolean;unavailable:boolean;urgent:boolean};
type SmsData={actions:Partial<Record<Action|'unavailable',Draft>>;followUp:FollowUp|null};
function smsUrl(draft:Draft){
 const digits=draft.number.replace(/[^0-9]/g,''),number=digits.length===10?`+91${digits}`:`+${digits}`;
 const ios=typeof navigator!=='undefined'&&/iPhone|iPad|iPod/.test(navigator.userAgent);
 return `sms:${number}${ios?'&':'?'}body=${encodeURIComponent(draft.message)}`;
}
export function CaseSms({caseId,action,refreshKey,onResponseWithdrawn}:{caseId:string;action:Action;refreshKey?:string;onResponseWithdrawn?:()=>void}) {
 const [data,setData]=useState<SmsData|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false);
 const [launchDraft,setLaunchDraft]=useState<Draft|null>(null);
 useEffect(()=>{let live=true;setData(null);setLaunchDraft(null);setError('');fetch(`/api/cases/${caseId}/sms`,{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('SMS controls could not be loaded. Refresh to retry.');return r.json() as Promise<SmsData>}).then(d=>{if(live)setData(d)}).catch(()=>{if(live)setError('SMS controls could not be loaded. Refresh to retry.')});return()=>{live=false}},[caseId,action,refreshKey]);
 async function act(next:'availability'|'unavailable'|'urgent'){
  if(pending.current)return;
  pending.current=true;setBusy(true);setError('');setLaunchDraft(null);
  try{
   const r=await fetch(`/api/cases/${caseId}/sms`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:next})});
   const result=await r.json() as SmsData & {error?:{message?:string}};
   if(!r.ok)throw new Error(result.error?.message??'Please retry.');
   const draft=data?.actions[next==='unavailable'?'unavailable':'availability'];
   setData(result);
   if(next!=='availability')onResponseWithdrawn?.();
   if(next!=='urgent'&&draft)setLaunchDraft(draft);
  }catch(e){setError(e instanceof Error?e.message:'Please retry.');}
  finally{pending.current=false;setBusy(false);}
 }
 const follow=action==='availability'?data?.followUp:null;
 const draft=data?.actions[action];
 if(!draft?.number&&!follow&&!error&&!launchDraft)return null;
 const button='inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-center font-bold text-white disabled:opacity-50';
 return <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
  {launchDraft&&<div role="status" className="mb-3 rounded-xl bg-blue-50 p-3"><p className="mb-2 break-all text-sm font-semibold">Action saved. SMS to: {launchDraft.number}</p><a href={smsUrl(launchDraft)} className={`${button} bg-blue-700`}>Open SMS app</a><p className="mt-2 text-xs">Tap to open the prepared message, then tap Send on your phone.</p></div>}
  {error&&<p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
  {follow?.opened?<>
   <div className="grid gap-2">
    <button disabled={busy||follow.unavailable||follow.urgent} onClick={()=>void act('unavailable')} className={`${button} bg-red-700`}>{follow.unavailable?'Cannot attend recorded — open SMS above':'I am sorry cannot be there (SMS)'}</button>
    <button disabled={busy||follow.urgent} onClick={()=>void act('urgent')} className={`${button} bg-amber-700`}>{follow.urgent?'Urgent search started':'Find another anesthetist urgently'}</button>
   </div>
   <p role="status" className="mt-2 text-xs text-slate-600">{follow.urgent?'Your response is withdrawn. The SOS search is active and alerts have been queued for other eligible anesthetists.':'The SMS button opens your messaging app and withdraws your availability. The urgent button starts an SOS search and alerts other eligible anesthetists.'}</p>
  </>:draft&&<>
   <p className="mb-2 break-all text-sm font-semibold">SMS to: {draft.number}</p>
   {action==='availability'?<button disabled={busy} onClick={()=>void act('availability')} className={`${button} bg-blue-700`}>{busy?'Opening…':'SMS Availability'}</button>:<a href={smsUrl(draft)} className={`${button} ${action==='cancellation'?'bg-red-700':'bg-blue-700'}`}>SMS {action[0].toUpperCase()+action.slice(1)}</a>}
  </>}
  {!follow?.urgent&&<p className="mt-2 text-xs text-slate-600">Review the draft and tap Send in your SMS app. The website cannot confirm SMS delivery.</p>}
 </div>;
}
