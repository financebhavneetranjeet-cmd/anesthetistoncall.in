import { env } from 'cloudflare:workers';
import { getSessionUser, isVerifiedAnaesthetist } from '@/lib/server/session';
import { jsonError, jsonOk } from '@/lib/server/http';
import { reopenAssignment } from '@/lib/server/reopen-assignment';
export async function POST(_: Request, { params }: { params: Promise<{id:string}> }) {
  if (!env.DB) return jsonError('Database unavailable.',503);
  const user=await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return jsonError('Verified anaesthetist access required.',403);
  const {id}=await params;
  if (!await reopenAssignment(id,user.id)) return jsonError('Only your selected or accepted assignment can be reopened, before surgery starts.',409);
  return jsonOk({case:{id,status:'open'}});
}
