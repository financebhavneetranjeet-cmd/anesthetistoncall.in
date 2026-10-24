"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/native-link";

type Clinician = { id:string; name:string; mobile:string|null; availableUntil:string };
function numberForLink(value:string|null) {
  if (!value) return null;
  const digits=value.replace(/\D/g,"");
  return digits.length===10?`+91${digits}`:digits.length>=11&&digits.length<=15?`+${digits}`:null;
}
export function AvailableClinicians() {
  const [items,setItems]=useState<Clinician[]>([]);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    try {
      const response=await fetch("/api/available-clinicians",{cache:"no-store"});
      const data=await response.json() as {anaesthetists?:Clinician[];error?:{message?:string}};
      if(!response.ok) throw new Error(data.error?.message??"Availability could not be loaded.");
      setItems((data.anaesthetists??[]).filter(item=>new Date(item.availableUntil).getTime()>Date.now()));setError("");
    } catch(cause) {setError((cause as Error).message);}
  },[]);
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(timer)},[load]);
  useEffect(()=>{const next=Math.min(...items.map(item=>new Date(item.availableUntil).getTime()).filter(time=>Number.isFinite(time)&&time>Date.now()));if(!Number.isFinite(next))return;const timer=window.setTimeout(()=>{setItems(previous=>previous.filter(item=>new Date(item.availableUntil).getTime()>Date.now()));void load()},Math.max(0,next-Date.now()+10));return()=>window.clearTimeout(timer)},[items,load]);
  return <main className="min-h-dvh bg-slate-50 px-3 py-6 text-slate-950 sm:p-8"><section className="mx-auto max-w-3xl"><Link href="/" className="font-semibold text-blue-700">← Home</Link><h1 className="mt-5 text-3xl font-bold">Available anaesthetists</h1><p className="mt-2 text-slate-600">Verified professionals who have saved current availability. Contact details are visible to approved hospital users.</p><button type="button" onClick={()=>void load()} className="mt-5 min-h-11 rounded-xl border px-4 font-semibold">Refresh</button>{error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}{!error&&items.length===0&&<p className="mt-5 rounded-xl bg-white p-5">No anaesthetists are currently available.</p>}<div className="mt-5 grid gap-3">{items.map(item=>{const number=numberForLink(item.mobile);return <article key={item.id} className="rounded-xl border bg-white p-4"><h2 className="font-bold">{item.name}</h2><p className="mt-1 text-sm">Available until {new Date(item.availableUntil).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",hour12:true})} IST</p>{number?<div className="mt-3 flex flex-wrap items-center gap-3"><span className="font-semibold">{item.mobile}</span><a href={`tel:${number}`} className="rounded-lg bg-blue-700 px-4 py-3 font-bold text-white">Call</a><a href={`sms:${number}`} className="rounded-lg border border-blue-700 px-4 py-3 font-bold text-blue-700">SMS</a></div>:<p className="mt-3 text-sm text-amber-800">Phone number unavailable. Ask the anaesthetist to update their verified account.</p>}</article>})}</div></section></main>;
}
