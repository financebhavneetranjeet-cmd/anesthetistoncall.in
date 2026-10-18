import { env } from 'cloudflare:workers';
import { getSessionUser, isApprovedHospital, isVerifiedAnaesthetist } from '@/lib/server/session';
import { jsonError, jsonOk } from '@/lib/server/http';
import { recordSmsAction, smsFollowup } from '@/lib/server/case-sms-followup';
export async function GET(_: Request, {params}: {params: Promise<{id:string}>}) {
  if (!env.DB) return jsonError('Database unavailable.',503);
  const user=await getSessionUser(), {id}=await params;
  const c=await env.DB.prepare(`SELECT c.*,h.name AS hospitalName,hu.mobile AS hospitalMobile,cu.mobile AS clinicianMobile,cu.full_name AS clinicianName,j.status AS journeyStatus FROM cases c JOIN hospitals h ON h.id=c.hospital_id JOIN users hu ON hu.id=h.owner_user_id LEFT JOIN users cu ON cu.id=c.assigned_clinician_user_id LEFT JOIN case_journeys j ON j.case_id=c.id WHERE c.id=?`).bind(id).first<any>();
  if (!c) return jsonError('Case not found.',404);
  const actions: Record<string,{number:string;message:string}>={};
  let followUp: Awaited<ReturnType<typeof smsFollowup>> | null = null;
  const reference=`Hospital: ${c.hospitalName}. Procedure: ${c.procedure_name}. Case: ${id}.`;
  if (isApprovedHospital(user)&&user.hospitalId===c.hospital_id) {
    if (['offered','assigned'].includes(c.status)&&c.clinicianMobile) actions.selection={number:c.clinicianMobile,message:`${c.hospitalName}: You have been selected for this anaesthesia case. Please confirm acceptance in Anesthetist on Call. ${reference}`};
  } else if (isVerifiedAnaesthetist(user)) {
    const response=await env.DB.prepare("SELECT id,status FROM case_responses WHERE case_id=? AND clinician_user_id=?").bind(id,user.id).first<{id:string;status:string}>();
    if(c.status==='open'&&!c.assigned_clinician_user_id&&response) {
      const state=await smsFollowup(id,user.id);
      if(state.opened) {
        followUp=state;
        actions.unavailable={number:c.hospitalMobile,message:`${user.fullName}: I am sorry, I cannot be there for your anaesthesia case. Please arrange another anaesthetist urgently. ${reference}`};
      } else if(response.status==='available') actions.availability={number:c.hospitalMobile,message:`${user.fullName}: I am available for your anaesthesia case. ${reference}`};
    }
    if(c.assigned_clinician_user_id===user.id) {
      if(['assigned','completed'].includes(c.status)) actions.acceptance={number:c.hospitalMobile,message:`${user.fullName}: I have accepted your anaesthesia assignment. ${reference}`};
      if(c.journeyStatus==='arrived'||c.arrived_at) actions.arrival={number:c.hospitalMobile,message:`${user.fullName}: I have arrived at the hospital for your anaesthesia case. ${reference}`};
      if(['replacement_required','replacement_searching','cancelled'].includes(c.status)&&c.cancelled_by_user_id===user.id) actions.cancellation={number:c.hospitalMobile,message:`${user.fullName}: I have cancelled my anaesthesia assignment. Please arrange a replacement. ${reference} Reason: ${(c.cancellation_reason||'not specified').replaceAll('_',' ')}.`};
    }
  } else return jsonError('Case SMS access required.',403);
  return jsonOk({actions,followUp});
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
  if(!env.DB) return jsonError('Database unavailable.',503);
  const user=await getSessionUser();
  if(!isVerifiedAnaesthetist(user)) return jsonError('Verified anaesthetist access required.',403);
  const {id}=await params;
  const body=await req.json().catch(()=>null) as {action?:string}|null;
  const action=body?.action;
  if(action!=='availability'&&action!=='unavailable'&&action!=='urgent') return jsonError('Invalid SMS action.');
  try {
    if(!await recordSmsAction(id,user.id,action)) return jsonError('This case is no longer open for this action. Refresh the case.',409);
    return GET(req,{params:Promise.resolve({id})});
  } catch {
    return jsonError('The action could not be completed. Please retry.',503);
  }
}
