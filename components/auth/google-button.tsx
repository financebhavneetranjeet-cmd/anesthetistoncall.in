export function GoogleButton({ role = "hospital", purpose = "login", enabled = true }: { role?: string; purpose?: "login" | "link"; enabled?: boolean }) {
  return <form action="/api/auth/google/start" method="post" className="space-y-2">
    <input type="hidden" name="role" value={role} /><input type="hidden" name="purpose" value={purpose} />
    <button type="submit" disabled={!enabled} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Continue with Google</button>
    {!enabled && <p className="text-sm text-slate-500">Google sign-in is being configured. Mobile OTP is available.</p>}
  </form>;
}
