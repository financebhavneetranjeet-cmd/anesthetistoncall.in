'use client';
import {useEffect,useState} from 'react';
type Action='availability'|'selection'|'acceptance'|'arrival'|'cancellation';
type Draft={number:string;message:string};
export function CaseSms({caseId,action,refreshKey}:{caseId:string;action:Action;refreshKey?:string}) {
 const [draft,setDraft]=useState<Draft|null>(null);
 useEffect(()=>{let live=true;fetch(`/api/cases/${caseId}/sms`,{cache:'no-store'}).then(async r=>{if(!r.ok)return null;return r.json() as Promise<{actions:Partial<Record<Action,Draft>>}>}).then(d=>{if(live)setDraft(d?.actions[action]??null)}).catch(()=>{if(live)setDraft(null)});return()=>{live=false}},[caseId,action,refreshKey]);
 if(!draft?.number)return null;
 const digits=draft.number.replace(/[^0-9]/g,''),number=digits.length===10?`+91${digits}`:`+${digits}`;
 const ios=typeof navigator!=='undefined'&&/iPhone|iPad|iPod/.test(navigator.userAgent);
 return <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900"><p className="mb-2 break-all text-sm font-semibold">SMS to: {number}</p><a href={`sms:${number}${ios?'&':'?'}body=${encodeURIComponent(draft.message)}`} className={`inline-flex min-h-11 items-center rounded-xl px-4 font-bold text-white ${action==='cancellation'?'bg-red-700':'bg-blue-700'}`}>SMS {action[0].toUpperCase()+action.slice(1)}</a><p className="mt-2 text-xs text-slate-600">Review the draft and tap Send in your SMS app.</p></div>;
}
