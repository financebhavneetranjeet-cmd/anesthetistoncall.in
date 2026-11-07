"use client";
import {useEffect,useState} from 'react';
import Link from '@/components/native-link';
export function CompletionFeedbackNotice(){
  const [count,setCount]=useState(0);
  useEffect(()=>{let active=true;let inFlight=false;const check=async()=>{if(inFlight||document.visibilityState!=='visible')return;inFlight=true;try{const r=await fetch('/api/case-feedback',{cache:'no-store'});if(!r.ok){if(active&&(r.status===401||r.status===403))setCount(0);return;}const d=await r.json() as {pending:unknown[]};if(active)setCount(d.pending.length);}catch{/* The server also enforces the requirement on each write. */}finally{inFlight=false;}};void check();const timer=window.setInterval(check,15000);window.addEventListener('focus',check);window.addEventListener('case-feedback-saved',check);return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('case-feedback-saved',check);};},[]);
  if(!count)return null;
  return <aside role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3"><p>Post-case answers required for {count} completed case{count===1?'':'s'} before adding or responding to another case.</p><Link href="/case-feedback" className="inline-flex min-h-11 items-center rounded-xl bg-amber-900 px-4 font-semibold text-white">Answer post-case questions</Link></div></aside>;
}
