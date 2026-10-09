import { redirect } from "next/navigation";import {isAdmin} from "@/lib/server/admin";import {AdminCaseList} from "./admin-case-list";
export const dynamic="force-dynamic";export default async function AdminCasesPage(){if (!(await isAdmin())) redirect("/login");return <AdminCaseList/>}
