import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";
import Link from "@/components/native-link";
import { isAdmin } from "@/lib/server/admin";

export default async function FacilityDocuments({ params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) redirect("/login");
  const { id } = await params;
  const documents = await env.DB?.prepare(`SELECT d.id, d.file_name AS fileName
    FROM verification_documents d JOIN hospitals h ON h.owner_user_id=d.user_id
    WHERE h.id=? AND d.document_type='facility_registration' ORDER BY d.created_at DESC`)
    .bind(id).all<{ id: string; fileName: string }>();
  return <main className="mx-auto max-w-2xl space-y-4 p-6">
    <Link className="text-blue-700 underline" href="/admin">Back to hospital approvals</Link>
    <h1 className="text-xl font-semibold">Facility registration documents</h1>
    {documents?.results.length ? <ul className="space-y-3">{documents.results.map(document => (
      <li key={document.id}><a className="break-all text-blue-700 underline" target="_blank" rel="noopener noreferrer"
        href={`/api/admin/hospitals/${id}/documents?documentId=${document.id}`}>{document.fileName}</a></li>
    ))}</ul> : <p>No facility documents on file.</p>}
  </main>;
}
