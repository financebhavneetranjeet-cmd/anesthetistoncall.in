import{ReceiptView}from"./receipt-view";export default async function ReceiptPage({params}:{params:Promise<{caseId:string}>}){return <ReceiptView caseId={(await params).caseId}/>}
