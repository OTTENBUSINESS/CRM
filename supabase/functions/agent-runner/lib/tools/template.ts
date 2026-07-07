/**
 * Interpolação simples de {{var}} em strings/objetos.
 * Usado por tools (HTTP body, SQL params, etc).
 *
 * Suporta:
 *  - {{arg_name}}                — valor direto do dict
 *  - {{secret:NAME}}             — valor do env (Deno.env)
 *  - {{user_id}}, {{session_id}} — passados no context
 *
 * NÃO suporta lógica condicional (sem if/else) — mantém simples.
 */

const SECRET_PREFIX = "secret:";

export function interpolate(
  template: string,
  vars: Record<string, unknown>,
): string {
  if (typeof template !== "string") return template;

  return template.replace(/\{\{([^}]+)\}\}/g, (_match, name) => {
    const key = (name as string).trim();

    if (key.startsWith(SECRET_PREFIX)) {
      const secretName = key.slice(SECRET_PREFIX.length);
      return Deno.env.get(secretName) || "";
    }

    const value = vars[key];
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

/**
 * Interpola recursivamente em todo um objeto (chaves e valores string).
 */
export function interpolateDeep<T>(obj: T, vars: Record<string, unknown>): T {
  if (typeof obj === "string") {
    return interpolate(obj, vars) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => interpolateDeep(v, vars)) as T;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = interpolateDeep(v, vars);
    }
    return result as T;
  }
  return obj;
}
