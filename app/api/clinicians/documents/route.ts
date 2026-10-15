import { notifyAdminsOfRegistration } from "@/lib/server/web-push";
import { env, waitUntil } from "cloudflare:workers";
import { getSessionUser } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]); const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !["anesthetist", "surgeon"].includes(user.role)) return jsonError("Clinician login required.", 401, "LOGIN_REQUIRED");
  if (user.status !== "pending" || !user.clinicianId || user.clinicianVerificationStatus !== "pending") return jsonError("Documents can only be submitted while professional verification is pending.", 403, "REGISTRATION_NOT_PENDING");
  if (!env.DB || !env.BUCKET) return jsonError("Document storage is unavailable.", 503, "STORAGE_UNAVAILABLE");
  const form = await request.formData(); const file = form.get("file"); const documentType = String(form.get("documentType") ?? "");
  if (!(file instanceof File)) return jsonError("Select a document.");
  if (!ALLOWED.has(file.type) || file.size > MAX_BYTES) return jsonError("Upload a PDF, JPG or PNG up to 5 MB.");
  if (!["pmc_certificate", "identity", "qualification"].includes(documentType)) return jsonError("Invalid document type.");
  const objectKey = `verification/${user.id}/${crypto.randomUUID()}`;
  await env.BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { originalName: file.name } });
  const id = crypto.randomUUID();
  try { await env.DB.prepare("INSERT INTO verification_documents (id, user_id, object_key, file_name, content_type, size_bytes, document_type) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, user.id, objectKey, file.name, file.type, file.size, documentType).run(); }
  catch (error) { await env.BUCKET.delete(objectKey); throw error; }
  waitUntil(notifyAdminsOfRegistration({ id: user.clinicianId, role: user.role as "anesthetist" | "surgeon", name: user.fullName, approvalRequestId: id }).catch(error => {
    console.error("Admin approval request push failed", { documentId: id, reason: error instanceof Error ? error.name : "UNKNOWN" });
  }));
  return jsonOk({ document: { id, fileName: file.name, documentType } }, 201);
}
