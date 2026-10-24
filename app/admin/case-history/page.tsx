import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/server/admin';
import Link from '@/components/native-link';
export const dynamic='force-dynamic';
type HistoryCase={id:string;procedure:string;hospital:string;status:string;scheduledAt:string;clinician:string|null};
type HistoryEvent={id:string;case_id:string;event_type:string;created_at:string;actor:string|null;details:string|null};
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}) {
  if(!await isAdmin()) redirect('/login');
  if(!env.DB) return <main className="p-6">Database unavailable.</main>;
  const input=Number((await searchParams).page??1);
  const page=Number.isSafeInteger(input)&&input>0?Math.min(input,100000):1;
  const cases=(await env.DB.prepare(`SELECT c.id,c.procedure_name AS procedure,h.name AS hospital,c.status,c.scheduled_at AS scheduledAt,u.full_name AS clinician FROM cases c JOIN hospitals h ON h.id=c.hospital_id LEFT JOIN users u ON u.id=c.assigned_clinician_user_id WHERE c.status IN ('offered','assigned','completed','cancelled') OR EXISTS (SELECT 1 FROM case_audit_events a WHERE a.case_id=c.id AND a.event_type='assignment_declined_reopened') ORDER BY c.created_at DESC,c.id LIMIT 50 OFFSET ?`).bind((page-1)*50).all()).results as HistoryCase[];
  const events=cases.length?(await env.DB.prepare(`SELECT a.*,u.full_name AS actor FROM case_audit_events a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.case_id IN (${cases.map(()=>'?').join(',')}) ORDER BY a.created_at,a.id`).bind(...cases.map(c=>c.id)).all()).results as HistoryEvent[]:[];
  const date=(value:string)=>new Date(value.endsWith('Z')||value.includes('+')?value:value.replace(' ','T')+'Z').toLocaleString("en-IN", {timeZone:'Asia/Kolkata', hour12: true });
  return <main className="min-h-dvh bg-slate-50 p-3 sm:p-8"><div className="mx-auto max-w-5xl"><Link href="/admin/control" className="text-blue-700">Back to Admin</Link><h1 className="mt-4 text-3xl font-bold">Case history</h1><p className="mt-2">Admin only. Selection, refusal, reopening and completion records are retained. Times shown in IST.</p><div className="mt-5 space-y-4">{cases.map(c=><article key={c.id} className="rounded-xl border bg-white p-4"><h2 className="text-xl font-bold">{c.procedure}</h2><p>{c.hospital} - {c.status}</p><p>{date(c.scheduledAt)} IST {c.clinician?`- ${c.clinician}`:''}</p><details className="mt-3"><summary className="cursor-pointer font-semibold">View history</summary><p className="mt-2 break-all text-sm">Case ID: {c.id}</p><ol className="mt-3 space-y-3">{events.filter(e=>e.case_id===c.id).map(e=><li key={e.id} className="rounded-lg bg-slate-50 p-3"><b>{e.event_type.replaceAll('_',' ')}</b><p>{date(e.created_at)} IST - {e.actor??'System'}</p>{e.details&&<p className="break-words text-sm">{e.details}</p>}</li>)}</ol></details></article>)}</div>{!cases.length&&<p className="mt-5">No case history on this page.</p>}<nav aria-label="History pages" className="mt-5 flex flex-wrap gap-4">{page>1&&<Link href={`/admin/case-history?page=${page-1}`}>Previous</Link>}<span>Page {page}</span>{cases.length===50&&<Link href={`/admin/case-history?page=${page+1}`}>Next</Link>}</nav></div></main>;
}
