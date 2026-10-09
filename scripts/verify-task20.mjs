import { readFileSync } from "node:fs";
const read=(p)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const checks={
  "completion request and hospital confirmation":[read("app/api/cases/[id]/progress/route.ts"),["completion_pending","confirm_complete","completion_confirmed"]],
  "locked fee payment lifecycle":[read("app/api/cases/[id]/payments/route.ts"),["payment_marked","partially_paid","settled","payment_disputed","payment_issue_raised"]],
  "role dashboards and filters":[read("app/payments/payments-dashboard.tsx"),["Today","This week","This month","Total earnings","All hospitals","Raise Payment Issue"]],
  "digital receipt":[read("app/payments/[caseId]/receipt/receipt-view.tsx"),["Receipt #","Case ID","Final agreed fee","Balance","Payment status","Download / Print"]],
  "financial audit and disputes":[read("db/schema.ts"),["paymentIssues","actorRole","previousValue","newValue","resolutionHistoryJson"]],
};
const missing=[];for(const[label,[source,markers]]of Object.entries(checks))for(const marker of markers)if(!source.includes(marker))missing.push(`${label}: ${marker}`);
if(missing.length){console.error("Task 20 verification failed:\n- "+missing.join("\n- "));process.exit(1)}
console.log("Task 20 payment, settlement, receipt, dashboard and audit checks passed.");
