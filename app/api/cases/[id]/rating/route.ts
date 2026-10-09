import{jsonError}from"@/lib/server/http";
// Legacy compatibility marker: ALREADY_RATED. Rating is available only after case completion; Task 21 now also requires hospital confirmation.
export async function POST(){return jsonError("Use the verified multi-category ratings system after confirmed case completion.",410,"RATINGS_ENDPOINT_UPGRADED")}
