/**
 * Helpers pra Server-Sent Events.
 */

import type { SseEvent } from "./types.ts";
import { corsHeaders } from "./cors.ts";

const encoder = new TextEncoder();

export function sseLine(event: SseEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function sseResponseHeaders(): HeadersInit {
  return {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    // Note: NÃO incluir "Connection: keep-alive" — proibido em HTTP/2 (Deno Deploy usa H2)
    "X-Accel-Buffering": "no",
  };
}

/**
 * Cria writer thread-safe pra controller SSE.
 * Garante que múltiplas writes não estouram race.
 */
export function makeSseWriter(controller: ReadableStreamDefaultController<Uint8Array>) {
  let closed = false;

  return {
    write(event: SseEvent) {
      if (closed) return;
      try {
        controller.enqueue(sseLine(event));
      } catch {
        closed = true;
      }
    },
    close() {
      if (closed) return;
      closed = true;
      try { controller.close(); } catch { /* ignore */ }
    },
    get isClosed() { return closed; },
  };
}
