/**
 * Patches pro SDK WaVoIP (@wavoip/wavoip-api).
 *
 * Cobre 3 bugs:
 *
 * BUG 1 — SDK carrega libsamplerate UMD em AudioWorkletGlobalScope.
 *   `addModule("https://cdn.jsdelivr.net/.../libsamplerate.min.js")` falha pq o
 *   arquivo e UMD (escreve `window.LibSampleRate`, nao existe no worklet).
 *   Fix: redirecionar pra versao worklet local /public/worklets/libsamplerate.worklet.js
 *   com `export {}` removido.
 *
 * BUG 2 — Vite dep-optimizer corrompe data URLs usadas pelo SDK.
 *   dist/index.es.js linhas 577/598 usam `new URL("data:text/javascript;base64,
 *   ...", import.meta.url)` pra carregar AudioWorklet processors embutidos. O
 *   esbuild do optimizeDeps reescreve esse padrao como asset reference,
 *   corrompendo o data URL. Fix: detectar base64 embutido, decodificar, servir
 *   via blob URL.
 *
 * BUG 3 — SDK nao expoe stream de audio remoto publicamente.
 *   O objeto `call` retornado por startCall/accept (factory E, linha 108) NAO
 *   expoe _transport nem audio_context. Pra capturar audio remoto pra
 *   transcricao/gravacao, interceptamos:
 *     - OUTGOING: AudioWorkletNode constructor quando processor name ===
 *       "audio-data-worklet-stream" (class `z`, linha 602). Conectamos num
 *       MediaStreamDestination.
 *     - INCOMING: RTCPeerConnection constructor + listener 'track' (class `_`,
 *       linha 30). Pegamos event.streams[0].
 *   Resultado exposto via `wavoipRemoteCapture` (singleton).
 */

let patched = false;
let libsamplerateBlobUrl: string | null = null;

// Singleton de captura de audio remoto (populado pelos patches no BUG 3)
export const wavoipRemoteCapture = {
  outgoingStream: null as MediaStream | null,
  outgoingAudioContext: null as AudioContext | null,
  incomingStream: null as MediaStream | null,
  reset() {
    this.outgoingStream = null;
    this.outgoingAudioContext = null;
    this.incomingStream = null;
  },
};

async function getLibsamplerateWorkletUrl(): Promise<string> {
  if (libsamplerateBlobUrl) return libsamplerateBlobUrl;
  const res = await fetch("/worklets/libsamplerate.worklet.js");
  if (!res.ok) throw new Error(`libsamplerate worklet fetch falhou: ${res.status}`);
  let code = await res.text();
  code = code.replace(/export\s*\{[^}]*\}\s*;?\s*$/m, "");
  code = code.replace(/export\s+default\s+[^;]+;?\s*$/m, "");
  const blob = new Blob([code], { type: "application/javascript" });
  libsamplerateBlobUrl = URL.createObjectURL(blob);
  return libsamplerateBlobUrl;
}

export function patchAudioWorkletForWavoip() {
  if (patched) return;
  if (typeof window === "undefined") return;

  // ---- BUG 1 + BUG 2: interceptar addModule ----
  if (typeof AudioWorklet !== "undefined" && AudioWorklet.prototype?.addModule) {
    const originalAddModule = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = async function patchedAddModule(
      moduleURL: string | URL,
      options?: WorkletOptions
    ): Promise<void> {
      const url = typeof moduleURL === "string" ? moduleURL : moduleURL.toString();

      // BUG 1
      if (url.includes("libsamplerate.min.js") || url.includes("libsamplerate.worklet.js")) {
        try {
          const blobUrl = await getLibsamplerateWorkletUrl();
          console.log("[WaVoIP patch] libsamplerate -> blob worklet local");
          return originalAddModule.call(this, blobUrl, options);
        } catch (e) {
          console.error("[WaVoIP patch] libsamplerate falhou:", e);
        }
      }

      // BUG 2
      const dataUrlMatch = url.match(/data:text\/javascript;base64,([A-Za-z0-9+/=]+)/);
      if (dataUrlMatch) {
        try {
          const code = atob(dataUrlMatch[1]);
          const blob = new Blob([code], { type: "application/javascript" });
          const blobUrl = URL.createObjectURL(blob);
          console.log("[WaVoIP patch] data URL corrompida -> blob reconstituido");
          return originalAddModule.call(this, blobUrl, options);
        } catch (e) {
          console.error("[WaVoIP patch] decodificar data URL falhou:", e);
        }
      }

      return originalAddModule.call(this, url, options);
    };
  }

  // ---- BUG 3 (OUTGOING): interceptar AudioWorkletNode ----
  if (typeof AudioWorkletNode !== "undefined") {
    const OriginalAudioWorkletNode = window.AudioWorkletNode;
    const ProxiedAudioWorkletNode = new Proxy(OriginalAudioWorkletNode, {
      construct(target, args: any[]) {
        const instance = Reflect.construct(target, args) as AudioWorkletNode;
        const [ctx, name] = args as [BaseAudioContext, string];
        if (name === "audio-data-worklet-stream") {
          try {
            // `ctx` e um AudioContext (nao OfflineAudioContext) — classe z usa AudioContext({sampleRate:16e3})
            const audioCtx = ctx as AudioContext;
            const dest = audioCtx.createMediaStreamDestination();
            instance.connect(dest);
            wavoipRemoteCapture.outgoingStream = dest.stream;
            wavoipRemoteCapture.outgoingAudioContext = audioCtx;
            console.log("[WaVoIP patch] OUTGOING remote audio capturado via playback_node");
          } catch (e) {
            console.error("[WaVoIP patch] falha ao capturar OUTGOING remote audio:", e);
          }
        }
        return instance;
      },
    });
    // @ts-expect-error — reatribuicao de global
    window.AudioWorkletNode = ProxiedAudioWorkletNode;
  }

  // ---- BUG 3 (INCOMING): interceptar RTCPeerConnection ----
  if (typeof RTCPeerConnection !== "undefined") {
    const OriginalRTC = window.RTCPeerConnection;
    const ProxiedRTC = new Proxy(OriginalRTC, {
      construct(target, args: any[]) {
        const pc = Reflect.construct(target, args) as RTCPeerConnection;
        pc.addEventListener("track", (event) => {
          const stream = event.streams?.[0];
          if (stream && stream.getAudioTracks().length > 0) {
            wavoipRemoteCapture.incomingStream = stream;
            console.log("[WaVoIP patch] INCOMING remote audio capturado via pc.ontrack");
          }
        });
        return pc;
      },
    });
    // @ts-expect-error — reatribuicao de global
    window.RTCPeerConnection = ProxiedRTC;
  }

  patched = true;
  console.log("[WaVoIP patch] AudioWorklet + AudioWorkletNode + RTCPeerConnection interceptados");
}
