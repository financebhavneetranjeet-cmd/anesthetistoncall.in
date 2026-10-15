// Ordinary case responses store an extra bid; SOS/replacement responses store a total.
export function feeBreakdown(postedFeePaise, proposedFeePaise, responseType = null) {
  const hospitalFeePaise = Number(postedFeePaise ?? 0);
  const totalFeePaise = responseType == null
    ? hospitalFeePaise + Number(proposedFeePaise ?? 0)
    : Number(proposedFeePaise ?? hospitalFeePaise);
  return { hospitalFeePaise, additionalFeePaise: totalFeePaise - hospitalFeePaise, totalFeePaise };
}
