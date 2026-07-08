import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  WebhookReceiver,
  EgressClient,
  EncodedFileType,
  EncodedFileOutput,
} from "https://esm.sh/livekit-server-sdk@2.7.0";
import { getIntegrationKey } from "../_shared/config.ts";

/**
 * LiveKit — Webhook de eventos (participant_joined, egress_ended, room_finished)
 *
 * PONTO CRÍTICO: o Egress (gravação) só inicia quando tem participante na sala.
 * Iniciar em `room_started` deixa o egress preso em EGRESS_STARTING pra sempre.
 * Por isso o trigger é `participant_joined`.
 *
 * WEBHOOK EXTERNO (verify_jwt = false): o LiveKit Cloud não manda JWT do
 * Supabase — a autenticação é feita via assinatura própria (WebhookReceiver),
 * retornando 401 se inválida.
 *
 * Chaves lidas da tabela `config` via getIntegrationKey (fallback Deno.env, cache 60s).
 * Updates em `meetings` são por livekit_room_name/id — a linha já existe com
 * tenant_id setado na criação, então não mexemos em tenant aqui.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Chaves resolvidas em runtime (tabela config > Deno.env)
  const [apiKey, apiSecret, livekitUrl] = await Promise.all([
    getIntegrationKey(supabase, "LIVEKIT_API_KEY"),
    getIntegrationKey(supabase, "LIVEKIT_API_SECRET"),
    getIntegrationKey(supabase, "LIVEKIT_URL"),
  ]);

  if (!apiKey || !apiSecret || !livekitUrl) {
    return new Response(
      "LiveKit não configurado — preencha LIVEKIT_API_KEY/SECRET/URL em Configurações → Integrações",
      { status: 500 }
    );
  }

  const body = await req.text();
  const auth = req.headers.get("Authorization") || "";

  // Valida assinatura do webhook (auth custom do LiveKit)
  const receiver = new WebhookReceiver(apiKey, apiSecret);
  let event: any;
  try {
    event = await receiver.receive(body, auth);
  } catch (_err) {
    return new Response("Invalid signature", { status: 401 });
  }

  const roomName = event.room?.name;
  console.log(`[livekit-webhook] event: ${event.event}, room: ${roomName}`);

  try {
    if (event.event === "participant_joined" && roomName) {
      // Inicia Egress quando o primeiro participante entrar (não na criação da sala)
      const { data: meeting } = await supabase
        .from("meetings")
        .select("id, recording_status")
        .eq("livekit_room_name", roomName)
        .maybeSingle();

      if (
        meeting &&
        meeting.recording_status !== "recording" &&
        meeting.recording_status !== "completed"
      ) {
        const [s3AccessKey, s3SecretKey, s3Endpoint, s3BucketRaw] = await Promise.all([
          getIntegrationKey(supabase, "S3_ACCESS_KEY"),
          getIntegrationKey(supabase, "S3_SECRET_KEY"),
          getIntegrationKey(supabase, "S3_ENDPOINT"),
          getIntegrationKey(supabase, "S3_BUCKET"),
        ]);
        const s3Bucket = s3BucketRaw || "meeting-recordings";

        if (!s3AccessKey || !s3SecretKey || !s3Endpoint) {
          console.warn(
            "[livekit-webhook] R2/S3 não configurado (S3_ACCESS_KEY/S3_SECRET_KEY/S3_ENDPOINT) — gravação não iniciada"
          );
          await supabase
            .from("meetings")
            .update({ recording_status: "failed" })
            .eq("id", meeting.id);
        } else {
          const filename = `${roomName}-${Date.now()}.mp4`;

          const output = new EncodedFileOutput({
            fileType: EncodedFileType.MP4,
            filepath: filename,
            output: {
              case: "s3",
              value: {
                accessKey: s3AccessKey,
                secret: s3SecretKey,
                endpoint: s3Endpoint,
                bucket: s3Bucket,
                region: "auto",
                forcePathStyle: true,
              },
            },
          });

          const egressClient = new EgressClient(
            livekitUrl.replace("wss://", "https://"),
            apiKey,
            apiSecret
          );

          try {
            await egressClient.startRoomCompositeEgress(
              roomName,
              { file: output },
              { layout: "grid" }
            );
            await supabase
              .from("meetings")
              .update({
                recording_status: "recording",
                started_at: new Date().toISOString(),
              })
              .eq("id", meeting.id);
            console.log(`[livekit-webhook] Egress iniciado: ${filename}`);
          } catch (err: any) {
            console.error("[livekit-webhook] Egress falhou:", err.message);
            await supabase
              .from("meetings")
              .update({ recording_status: "failed" })
              .eq("id", meeting.id);
          }
        }
      }
    }

    if (event.event === "egress_ended" && event.egressInfo) {
      const file = event.egressInfo.fileResults?.[0] || event.egressInfo.file;
      const filename = file?.filename;
      const roomNameFromEgress = event.egressInfo.roomName;

      if (filename && roomNameFromEgress) {
        const s3PublicUrl = await getIntegrationKey(supabase, "S3_PUBLIC_URL");
        const publicUrl = s3PublicUrl ? `${s3PublicUrl}/${filename}` : null;

        if (!publicUrl) {
          console.warn(
            "[livekit-webhook] S3_PUBLIC_URL não configurada — recording_url ficará vazia"
          );
        }

        await supabase
          .from("meetings")
          .update({
            recording_url: publicUrl,
            recording_status: "completed",
          })
          .eq("livekit_room_name", roomNameFromEgress);
        console.log(`[livekit-webhook] Gravação salva: ${publicUrl || filename}`);
      }
    }

    if (event.event === "room_finished" && roomName) {
      await supabase
        .from("meetings")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
        })
        .eq("livekit_room_name", roomName);
    }
  } catch (err: any) {
    console.error("[livekit-webhook] Error processing event:", err.message);
  }

  return new Response("OK", { status: 200 });
});
