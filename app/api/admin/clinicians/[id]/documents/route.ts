import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return jsonError("Admin access required.", 403, "ADMIN_REQUIRED");
  if (!env.DB || !env.BUCKET) return jsonError("Secure document storage is unavailable.", 503, "STORAGE_UNAVAILABLE");
  const { id } = await context.params;
  const clinician = await env.DB.prepare("SELECT user_id AS userId FROM clinician_profiles WHERE id=? LIMIT 1").bind(id).first<{ userId: string }>();
  if (!clinician) return jsonError("Clinician not found.", 404, "NOT_FOUND");
  const url = new URL(request.url); const documentId = url.searchParams.get("documentId");
  if (!documentId) {
    const documents = await env.DB.prepare("SELECT id, file_name AS fileName, content_type AS contentType, size_bytes AS sizeBytes, document_type AS documentType, created_at AS uploadedAt FROM verification_documents WHERE user_id=? ORDER BY created_at DESC").bind(clinician.userId).all();
    return jsonOk({ documents: documents.results });
  }
  const document = await env.DB.prepare("SELECT object_key AS objectKey, file_name AS fileName, content_type AS contentType FROM verification_documents WHERE id=? AND user_id=? LIMIT 1").bind(documentId, clinician.userId).first<{ objectKey: string; fileName: string; contentType: string }>();
  if (!document) return jsonError("Document not found.", 404, "NOT_FOUND");
  const object = await env.BUCKET.get(document.objectKey);
  if (!object) return jsonError("Document file is unavailable.", 404, "FILE_NOT_FOUND");
  const safeName = document.fileName.replace(/["\r\n]/g, "");
  return new Response(object.body, { headers: { "content-type": document.contentType, "content-disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${safeName}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
