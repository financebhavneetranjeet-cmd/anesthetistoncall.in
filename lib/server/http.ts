import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400, code = "BAD_REQUEST") {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export function jsonOk<T extends object>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}
