export function MedicalRegisterLinks() {
  return (
    <div className="space-y-2 text-sm">
      <a className="inline-flex min-h-11 items-center rounded-xl border border-blue-700 px-3 font-semibold text-blue-800"
        href="https://nmr.nmc.org.in/search-doctor" target="_blank" rel="noopener noreferrer">
        Verify with NMC / PMC
      </a>
      <p>Opens the official National Medical Register. Search by the registration details. An administrator records the result.</p>
      <a className="inline-flex min-h-11 items-center font-semibold text-blue-800 underline"
        href="https://www.nmc.org.in/information-desk/indian-medical-register" target="_blank" rel="noopener noreferrer">
        Indian Medical Register (alternate search)
      </a>
    </div>
  );
}
