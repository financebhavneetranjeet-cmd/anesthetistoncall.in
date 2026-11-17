import { getRegistrationDocuments } from "@/lib/server/registration-documents";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getRegistrationDocuments(request, (await params).id);
}
