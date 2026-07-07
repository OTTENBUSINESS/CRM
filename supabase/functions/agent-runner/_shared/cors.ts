export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400", // 24h — evita preflight repetido em cada SSE
};

export function corsResponse(status = 204) {
  return new Response(null, { status, headers: corsHeaders });
}
