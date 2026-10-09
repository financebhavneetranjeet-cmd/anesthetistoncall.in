"use client";
import { emailSchema } from "@/lib/auth/email";

import Link from "@/components/native-link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpVerification } from "@/components/auth/otp-verification";
import { Label } from "@/components/ui/label";
import {
  clearRegistrationHandoff,
  readRegistrationHandoff,
} from "@/lib/auth/registration-handoff";

type PlaceSuggestion = { placeId: string; name: string; address: string };
type Place = PlaceSuggestion & {
  city: "Amritsar";
  latitude: number;
  longitude: number;
  googleMapsUri?: string;
};
type Step = "details" | "review" | "pending";
type FacilityType = "hospital" | "diagnostic_center";
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new Error("Network error. Check your connection and try again.");
  }
  const data = (await response.json()) as T & {
    ok: boolean;
    error?: { message: string; code: string };
  };
  if (!response.ok)
    throw new Error(data.error?.message ?? "Something went wrong.");
  return data;
}

export function HospitalRegistrationForm() {
  const [step, setStep] = useState<Step>("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [facilityType, setFacilityType] = useState<FacilityType>("hospital");
  const [mobile, setMobile] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [mapsMessage, setMapsMessage] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const facilityLabel = facilityType === "diagnostic_center" ? "Diagnostic Center" : "Hospital";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const handoff = readRegistrationHandoff();
      if (!handoff || handoff.role !== "hospital") return;
      setChallengeId(handoff.challengeId);
      setMobile(handoff.mobile);
      setFacilityType(handoff.facilityType ?? "hospital");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2 || place?.name === query) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setSearching(true);
        const result = await api<{ suggestions: PlaceSuggestion[] }>(
          `/api/places/autocomplete?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        setSuggestions(result.suggestions);
        setMapsMessage(
          result.suggestions.length
            ? null
            : "No matching Amritsar medical facilities found. Try the full name.",
        );
      } catch (cause) {
        if ((cause as Error).name !== "AbortError") {
          setSuggestions([]);
          setMapsMessage((cause as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, place?.name]);

  async function selectPlace(suggestion: PlaceSuggestion) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ place: Place }>(
        `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
      );
      const selected = result.place;
      setPlace(selected);
      const position = { lat: selected.latitude, lng: selected.longitude };
      setQuery(selected.name);
      setSuggestions([]);
      setMapsMessage(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!challengeId || !place) return;
    if (!emailSchema.safeParse(email).success) return setError("Enter a valid email address.");
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ registration: { status: string } }>("/api/hospitals/register", {
        method: "POST",
        body: JSON.stringify({
          challengeId,
          fullName,
          email,
          mobile,
          facilityType,
          hospitalName: place.name,
          address: place.address,
          city: "Amritsar",
            googlePlaceId: place.placeId,
            latitude: place.latitude,
            longitude: place.longitude,
            googleMapsUri:
              place.googleMapsUri ??
              `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}&query_place_id=${encodeURIComponent(place.placeId)}`,
        }),
      });
      clearRegistrationHandoff();
      if (result.registration.status === "approved")
        window.location.assign("/");
      else setStep("pending");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f3f7fb] px-3 py-4 text-slate-950 sm:px-4 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600"
        >
          <ArrowLeft className="size-4" /> Back to home
        </Link>
        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,.1)] sm:mt-6 sm:rounded-[2rem]">
          <header className="bg-[#0b3159] p-5 text-white sm:p-9">
            <div className="flex items-start gap-3 sm:items-center">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-300 text-[#0b3159] sm:size-11 sm:rounded-2xl">
                <Building2 />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[.1em] text-cyan-200 sm:text-sm sm:tracking-[.12em]">
                  Medical facility onboarding
                </p>
                <h1 className="font-serif text-2xl font-semibold sm:text-3xl">
                  Register your {facilityLabel.toLowerCase()}
                </h1>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs sm:mt-7">
              <Progress
                active={step !== "details"}
                label="Details"
                number="1"
              />
              <Progress
                active={step === "review" || step === "pending"}
                label="OTP"
                number="2"
              />
              <Progress
                active={step === "pending"}
                label="Approval"
                number="3"
              />
            </div>
          </header>
          <section className="p-5 sm:p-9">
            {step === "details" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold">Authorised contact</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Use the mobile number responsible for hospital case
                    coordination.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name">
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Authorised person"
                    />
                  </Field>
                  <Field label="Email Address (required)">
                    <Input
                      type="email" required maxLength={254} autoComplete="email" autoCapitalize="none"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="hospital@example.com"
                    />
                  </Field>
                </div>
                <fieldset className="border-t border-slate-200 pt-6">
                  <legend className="text-xl font-semibold">Facility type</legend>
                  <p className="mt-1 text-sm text-slate-500">Choose the correct category for the private member directory.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {([ ["hospital", "Hospital"], ["diagnostic_center", "Diagnostic Center"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={facilityType === value} onClick={() => setFacilityType(value)} className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${facilityType === value ? "border-blue-700 bg-blue-50 text-blue-800 ring-1 ring-blue-700" : "border-slate-200 bg-white text-slate-700"}`}>{label}</button>)}
                  </div>
                </fieldset>
                <div className="border-t border-slate-200 pt-6">
                  <h2 className="text-xl font-semibold">
                    {facilityLabel} on Google Maps
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Search and select a hospital, diagnostic center, or clinic in Amritsar, Punjab.
                    The selected Google location will be verified before
                    registration.
                  </p>
                  <div className="relative mt-4">
                    <Search className="absolute left-3 top-3 size-5 text-slate-400" />
                    <Input
                      className="h-12 pl-10"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPlace(null);
                      }}
                      placeholder={`Search ${facilityLabel.toLowerCase()} in Amritsar`}
                      autoComplete="off"
                      aria-label={`Search ${facilityLabel.toLowerCase()}`}
                      aria-expanded={suggestions.length > 0}
                    />
                    {searching && <Loader2 className="absolute right-3 top-3.5 size-5 animate-spin text-blue-700" aria-label="Searching" />}
                    {suggestions.length > 0 && (
                      <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                        {suggestions.map((item) => (
                          <button
                            type="button"
                            key={item.placeId}
                            onClick={() => selectPlace(item)}
                            className="flex w-full gap-3 border-b border-slate-100 p-3 text-left last:border-0 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                          >
                            <MapPin className="mt-0.5 size-5 shrink-0 text-blue-700" />
                            <span>
                              <strong className="block text-sm">
                                {item.name}
                              </strong>
                              <small className="text-slate-500">
                                {item.address}
                              </small>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {mapsMessage && (
                    <p className="mt-2 text-sm text-amber-700">{mapsMessage}</p>
                  )}
                  {place && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50">
                      <iframe
                        title={`${place.name} on Google Maps`}
                        className="h-52 w-full border-0 sm:h-64"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://www.google.com/maps?q=${place.latitude},${place.longitude}&z=16&output=embed`}
                      />
                      <div className="p-4">
                        <p className="flex items-center gap-2 font-semibold text-emerald-900">
                          <CheckCircle2 className="size-5" />
                          {place.name}
                        </p>
                        <p className="mt-1 text-sm text-emerald-800">
                          {place.address}
                        </p>
                        <p className="mt-1 text-xs text-emerald-700">
                          {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
                        </p>
                        {place.googleMapsUri && (
                          <a
                            className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline"
                            target="_blank"
                            rel="noreferrer"
                            href={place.googleMapsUri}
                          >
                            Open in Google Maps
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {challengeId ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                      <CheckCircle2 className="mr-2 inline size-5" />
                      <strong>+91 {mobile}</strong> verified
                    </div>
                    <Button
                      type="button"
                      disabled={fullName.trim().length < 2 || !emailSchema.safeParse(email).success || !place}
                      onClick={() => setStep("review")}
                      className="h-12 w-full rounded-xl bg-blue-700"
                    >
                      Review registration
                    </Button>
                  </div>
                ) : (
                  <OtpVerification
                    mobile={mobile}
                    onMobileChange={setMobile}
                    purpose="registration"
                    beforeSend={() =>
                      fullName.trim().length < 2 || !emailSchema.safeParse(email).success || !place
                        ? `Enter contact details and select an Amritsar ${facilityLabel.toLowerCase()} from Google Maps.`
                        : null
                    }
                    onVerified={(result) => {
                      if (!result.challengeId)
                        throw new Error(
                          "Mobile verification did not complete.",
                        );
                      setChallengeId(result.challengeId);
                      setError(null);
                      setStep("review");
                    }}
                  />
                )}
              </div>
            )}
            {step === "review" && place && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold">
                    Review registration
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Your account will remain pending until admin verification.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-5 text-sm">
                  <Review label="Facility type" value={facilityLabel} />
                  <Review label={facilityLabel} value={place.name} />
                  <Review label="Address" value={place.address} />
                  <Review label="Authorised contact" value={fullName} />
                  <Review
                    label="Verified mobile"
                    value={`+91 ${mobile}`}
                    last
                  />
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  <Clock3 className="mt-0.5 size-5 shrink-0" />
                  <p>
                    <strong>Admin approval required.</strong>
                    <br />
                    Case posting will unlock only after your medical facility is
                    approved.
                  </p>
                </div>
                <Button
                  disabled={busy}
                  onClick={submit}
                  className="h-12 w-full rounded-xl bg-emerald-600 text-base hover:bg-emerald-700"
                >
                  {busy && <Loader2 className="animate-spin" />} Submit for
                  approval
                </Button>
              </div>
            )}
            {step === "pending" && <p className="mb-4 rounded-xl bg-blue-50 p-4 text-center text-sm text-blue-900"><a href="/account/google" className="inline-flex min-h-11 items-center font-semibold underline">Connect Google for faster login next time</a></p>}
    {step === "pending" && (
              <div className="py-8 text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-amber-100 text-amber-700">
                  <Clock3 className="size-8" />
                </span>
                <h2 className="mt-5 text-2xl font-semibold">
                  Registration pending approval
                </h2>
                <p className="mx-auto mt-3 max-w-md text-slate-600">
                  Your mobile is verified and {facilityLabel.toLowerCase()} details have been
                  submitted. Case posting will be enabled after admin approval.
                </p>
                <Button asChild className="mt-7 rounded-xl bg-blue-700">
                  <Link href="/account/pending">View verification status</Link>
                </Button>
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700"
              >
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Progress({
  number,
  label,
  active,
}: {
  number: string;
  label: string;
  active: boolean;
}) {
  return (
    <div className={active ? "text-cyan-200" : "text-white"}>
      <span
        className={`mx-auto mb-1 grid size-7 place-items-center rounded-full ${active ? "bg-cyan-300 text-[#0b3159]" : "bg-white/15"}`}
      >
        {active ? <CheckCircle2 className="size-4" /> : number}
      </span>
      {label}
    </div>
  );
}
function Review({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`grid min-w-0 gap-1 py-3 sm:grid-cols-[150px_1fr] ${last ? "" : "border-b border-slate-100"}`}
    >
      <span className="text-slate-500">{label}</span>
      <strong className="break-words">{value}</strong>
    </div>
  );
}
