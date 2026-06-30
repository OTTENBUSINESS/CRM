// Guarda de chamada para funções internas / de IA.
//
// Mantemos verify_jwt = false (a função é chamada por crons, triggers E pelo
// frontend), então a validação de quem chamou é feita AQUI:
//   - service_role  → crons, triggers, outras edge functions (header Authorization)
//   - usuário logado → o frontend (supabase.functions.invoke) manda o JWT do
//                      usuário automaticamente; aceitamos qualquer role != 'anon'
//   - BLOQUEIA       → anon key (role 'anon') e requisições sem token
//
// Objetivo: fechar a porta pra estranhos SEM afetar nenhum chamador legítimo.

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

export function isAuthorizedCaller(req: Request): boolean {
  const auth =
    req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return false;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceKey && jwt === serviceKey) return true;

  const payload = decodeJwtPayload(jwt);
  if (payload && typeof payload.role === "string" && payload.role !== "anon") {
    return true;
  }
  return false;
}

export function unauthorizedResponse(
  corsHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
