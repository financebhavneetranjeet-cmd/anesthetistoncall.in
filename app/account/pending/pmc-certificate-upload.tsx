"use client";
import { useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function PmcCertificateUpload(){
 const[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null),[done,setDone]=useState(false);
 async function upload(){if(!file)return;setBusy(true);setMessage(null);const form=new FormData();form.set("file",file);form.set("documentType","pmc_certificate");try{const r=await fetch("/api/clinicians/documents",{method:"POST",body:form}),b=await r.json() as{error?:{message?:string}};if(!r.ok)throw new Error(b.error?.message??"Upload failed.");setDone(true);setMessage("PMC certificate uploaded securely for Admin review.");}catch(c){setMessage((c as Error).message)}finally{setBusy(false)}}
 return <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left"><p className="font-semibold text-amber-950"><FileCheck2 className="mr-2 inline size-5"/>PMC Certificate (Required for manual verification)</p><p className="mt-2 text-sm text-amber-900">PMC verification could not be completed. Please upload your PMC certificate for manual verification.</p>{!done&&<><Input className="mt-4 h-auto min-h-12 bg-white py-2" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setFile(e.target.files?.[0]??null)}/><Button onClick={upload} disabled={!file||busy} className="mt-3 h-12 w-full rounded-xl bg-blue-700">{busy&&<Loader2 className="animate-spin"/>} Upload certificate</Button></>}{message&&<p className={`mt-3 text-sm font-medium ${done?"text-emerald-700":"text-red-700"}`}>{message}</p>}</div>
}
