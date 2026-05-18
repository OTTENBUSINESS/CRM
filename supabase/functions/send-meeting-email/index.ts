import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-3-haiku-20240307";

// ─── Types ────────────────────────────────────────────────────
interface EmailInput {
  lead_id: string;
  email_type: "scheduled" | "reminder"; // agendamento vs lembrete
  meeting_date: string; // ISO
  meeting_duration_minutes?: number;
  specialist_id?: string;
  specialist_name?: string;
  meet_link?: string;
  deal_id?: string;
  product_id?: string;
}

interface AIContent {
  // scheduled: bullet points of topics
  topics?: string[];
  // reminder: 2 paragraphs of personalized context
  paragraph1?: string;
  paragraph2?: string;
}

// ─── Helpers ──────────────────────────────────────────────────

// Converte UTC para horário de Brasília (UTC-3)
function toBrasilia(d: Date): Date {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000);
}

function formatDatePtBR(iso: string): string {
  const brt = toBrasilia(new Date(iso));
  const days = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
  const months = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return `${days[brt.getUTCDay()]}, ${brt.getUTCDate()} de ${months[brt.getUTCMonth()]} de ${brt.getUTCFullYear()}`;
}

function formatTimePtBR(iso: string): string {
  const brt = toBrasilia(new Date(iso));
  return `${String(brt.getUTCHours()).padStart(2, "0")}:${String(brt.getUTCMinutes()).padStart(2, "0")}`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCalendarLinks(iso: string, durationMinutes: number, specialistName: string, meetLink: string) {
  const start = new Date(iso);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  // Format: YYYYMMDDTHHmmSSZ
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const title = encodeURIComponent(`Reunião IAP com ${specialistName}`);
  const details = encodeURIComponent(
    `Reunião com ${specialistName} - Especialista IAP${meetLink ? `\n\nLink: ${meetLink}` : ""}`
  );

  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}${meetLink ? `&location=${encodeURIComponent(meetLink)}` : ""}`;

  const outlook = `https://outlook.live.com/calendar/0/action/compose?subject=${title}&startdt=${start.toISOString()}&enddt=${end.toISOString()}&body=${details}${meetLink ? `&location=${encodeURIComponent(meetLink)}` : ""}`;

  return { gcal, outlook };
}

// ─── Email Templates ──────────────────────────────────────────

function buildScheduledEmail(params: {
  leadName: string;
  date: string;
  time: string;
  duration: number;
  specialistName: string;
  specialistInitials: string;
  meetLink: string;
  topics: string[];
  gcalLink: string;
  outlookLink: string;
}): string {
  const {
    leadName,
    date,
    time,
    duration,
    specialistName,
    specialistInitials,
    meetLink,
    topics,
    gcalLink,
    outlookLink,
  } = params;
  const firstName = escapeHtml(leadName.split(" ")[0]);

  const topicRows = topics
    .map(
      (t) => `
              <tr>
                <td style="padding:6px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="24" valign="top" style="font-family:'Inter',system-ui,sans-serif;font-size:14px;color:#f97316;font-weight:700;line-height:1.6;">&#10140;</td>
                      <td style="font-family:'Inter',system-ui,sans-serif;font-size:14px;color:#44403c;line-height:1.6;">${escapeHtml(t)}</td>
                    </tr>
                  </table>
                </td>
              </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:'Inter',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 8px 30px rgba(0,0,0,0.06);">

  <!-- Header -->
  <tr><td style="padding:32px 40px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle">
        <span style="font-family:'Inter',system-ui,sans-serif;font-size:22px;font-weight:900;color:#0a0a0a;letter-spacing:-0.5px;">IAP</span>
        <span style="font-family:'Inter',system-ui,sans-serif;font-size:10px;font-weight:700;color:#a3a3a3;letter-spacing:2px;text-transform:uppercase;vertical-align:middle;margin-left:8px;">IA NA PR&Aacute;TICA</span>
      </td>
      <td align="right" valign="middle">
        <div style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:100px;padding:6px 14px;">
          <span style="font-family:'Inter',system-ui,sans-serif;font-size:11px;font-weight:700;color:#16a34a;letter-spacing:0.3px;">&#10003; Agendado com sucesso</span>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Accent -->
  <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,#f97316,#fdba74,#f97316);"></div></td></tr>

  <!-- Greeting -->
  <tr><td style="padding:32px 40px 0;">
    <p style="margin:0 0 4px;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#f97316;">Ol&aacute;, ${firstName}</p>
    <h1 style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:28px;font-weight:800;color:#0a0a0a;line-height:1.2;letter-spacing:-0.5px;">Sua reuni&atilde;o foi agendada.</h1>
    <p style="margin:10px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:15px;color:#737373;line-height:1.6;">Confirmamos o hor&aacute;rio com o nosso especialista. Veja os detalhes abaixo.</p>
  </td></tr>

  <!-- Meeting Card -->
  <tr><td style="padding:28px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:16px;">
      <tr><td style="padding:24px;">
        <p style="margin:0 0 18px;font-family:'Inter',system-ui,sans-serif;font-size:10px;font-weight:700;color:#a8a29e;letter-spacing:2px;text-transform:uppercase;">Detalhes da reuni&atilde;o</p>

        <!-- Date -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
          <td width="36" valign="top"><div style="width:34px;height:34px;background:#ffffff;border:1px solid #e7e5e4;border-radius:10px;text-align:center;line-height:34px;font-size:15px;">&#128197;</div></td>
          <td style="padding-left:14px;" valign="middle"><p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#1c1917;">${escapeHtml(date)}</p></td>
        </tr></table>

        <!-- Time -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
          <td width="36" valign="top"><div style="width:34px;height:34px;background:#ffffff;border:1px solid #e7e5e4;border-radius:10px;text-align:center;line-height:34px;font-size:15px;">&#128336;</div></td>
          <td style="padding-left:14px;" valign="middle"><p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#1c1917;">${escapeHtml(time)}<span style="font-weight:400;color:#78716c;font-size:13px;">&nbsp;hor&aacute;rio de Bras&iacute;lia</span></p></td>
        </tr></table>

        <!-- Platform -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
          <td width="36" valign="top"><div style="width:34px;height:34px;background:#ffffff;border:1px solid #e7e5e4;border-radius:10px;text-align:center;line-height:34px;font-size:15px;">&#127909;</div></td>
          <td style="padding-left:14px;" valign="middle">
            <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#1c1917;">Google Meet</p>
            <p style="margin:2px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:500;color:#a8a29e;">${meetLink ? "Link dispon&iacute;vel abaixo" : "O link ser&aacute; enviado antes da reuni&atilde;o"}</p>
          </td>
        </tr></table>

        <div style="height:1px;background:#e7e5e4;margin:0 0 16px;"></div>

        <!-- Specialist -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="36" valign="top"><div style="width:34px;height:34px;background:linear-gradient(135deg,#fb923c,#ea580c);border-radius:50%;text-align:center;line-height:34px;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:800;color:#ffffff;">${escapeHtml(specialistInitials)}</div></td>
          <td style="padding-left:14px;" valign="middle">
            <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#1c1917;">${escapeHtml(specialistName)}</p>
            <p style="margin:2px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:500;color:#a8a29e;">Especialista IAP</p>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- AI Block -->
  <tr><td style="padding:24px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#fffbf5 0%,#fff7ed 100%);border:1px solid #fed7aa;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr>
          <td style="background:#ffffff;border:1px solid #fdba74;border-radius:8px;padding:4px 10px;">
            <span style="font-family:'Inter',system-ui,sans-serif;font-size:10px;font-weight:700;color:#ea580c;letter-spacing:0.8px;text-transform:uppercase;">&#10024; Preparado por IA para voc&ecirc;</span>
          </td>
        </tr></table>
        <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#1c1917;line-height:1.5;">O que vamos abordar na reuni&atilde;o:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
          ${topicRows}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA: Adicionar ao Calendar -->
  <tr><td style="padding:28px 40px 0;" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td align="center" style="border-radius:14px;background:#0a0a0a;">
        <a href="${escapeHtml(gcalLink)}" target="_blank" style="display:block;padding:18px 48px;font-family:'Inter',system-ui,sans-serif;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.3px;text-align:center;">Adicionar ao Google Calendar &nbsp;&rarr;</a>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:10px 40px 0;" align="center">
    <a href="${escapeHtml(outlookLink)}" target="_blank" style="display:inline-block;padding:10px 20px;font-family:'Inter',system-ui,sans-serif;color:#78716c;font-size:13px;font-weight:600;text-decoration:none;">Adicionar ao Outlook</a>
  </td></tr>

  <!-- Reschedule -->
  <tr><td style="padding:24px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:14px 18px;">
        <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:13px;color:#78716c;line-height:1.6;">Precisa mudar o hor&aacute;rio? Sem problema &mdash; responde pelo <strong style="color:#ea580c;">WhatsApp</strong> que a gente ajusta.</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- Footer divider -->
  <tr><td style="padding:32px 40px 0;"><div style="height:1px;background:#e7e5e4;"></div></td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 40px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle">
        <span style="font-family:'Inter',system-ui,sans-serif;font-size:16px;font-weight:900;color:#0a0a0a;letter-spacing:-0.3px;">IAP</span>
        <span style="font-family:'Inter',system-ui,sans-serif;font-size:11px;font-weight:500;color:#a8a29e;margin-left:6px;">Automa&ccedil;&atilde;o inteligente</span>
      </td>
      <td align="right" valign="middle">
        <a href="https://napratica.ai" style="font-family:'Inter',system-ui,sans-serif;font-size:12px;color:#f97316;text-decoration:none;font-weight:600;">napratica.ai</a>
      </td>
    </tr></table>
  </td></tr>

</table>
<p style="margin:20px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:11px;color:#a8a29e;text-align:center;">Este email foi enviado porque voc&ecirc; agendou uma reuni&atilde;o com a IAP.</p>
</td></tr></table>
</body></html>`;
}

function buildReminderEmail(params: {
  leadName: string;
  date: string;
  time: string;
  duration: number;
  specialistName: string;
  specialistInitials: string;
  meetLink: string;
  paragraph1: string;
  paragraph2: string;
  gcalLink: string;
  outlookLink: string;
}): string {
  const {
    leadName,
    date,
    time,
    duration,
    specialistName,
    specialistInitials,
    meetLink,
    paragraph1,
    paragraph2,
    gcalLink,
    outlookLink,
  } = params;
  const firstName = escapeHtml(leadName.split(" ")[0]);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:'Inter',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 8px 30px rgba(0,0,0,0.06);">

  <!-- Header -->
  <tr><td style="padding:32px 40px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle">
        <span style="font-family:'Inter',system-ui,sans-serif;font-size:22px;font-weight:900;color:#0a0a0a;letter-spacing:-0.5px;">IAP</span>
        <span style="font-family:'Inter',system-ui,sans-serif;font-size:10px;font-weight:700;color:#a3a3a3;letter-spacing:2px;text-transform:uppercase;vertical-align:middle;margin-left:8px;">IA NA PR&Aacute;TICA</span>
      </td>
      <td align="right" valign="middle">
        <div style="display:inline-block;background:#fff7ed;border:1px solid #fed7aa;border-radius:100px;padding:6px 14px;">
          <span style="font-family:'Inter',system-ui,sans-serif;font-size:11px;font-weight:700;color:#ea580c;letter-spacing:0.3px;">&#9679; Reuni&atilde;o Confirmada</span>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Accent -->
  <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,#f97316,#fdba74,#f97316);"></div></td></tr>

  <!-- Greeting -->
  <tr><td style="padding:32px 40px 0;">
    <p style="margin:0 0 4px;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#f97316;">Ol&aacute;, ${firstName}</p>
    <h1 style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:28px;font-weight:800;color:#0a0a0a;line-height:1.2;letter-spacing:-0.5px;">Tudo pronto pra nossa conversa.</h1>
    <p style="margin:10px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:15px;color:#737373;line-height:1.6;">Separamos algumas coisas que v&atilde;o fazer sentido pra voc&ecirc;.</p>
  </td></tr>

  <!-- AI Block -->
  <tr><td style="padding:24px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#fffbf5 0%,#fff7ed 100%);border:1px solid #fed7aa;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr>
          <td style="background:#ffffff;border:1px solid #fdba74;border-radius:8px;padding:4px 10px;">
            <span style="font-family:'Inter',system-ui,sans-serif;font-size:10px;font-weight:700;color:#ea580c;letter-spacing:0.8px;text-transform:uppercase;">&#10024; Personalizado por IA</span>
          </td>
        </tr></table>
        <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:14.5px;color:#44403c;line-height:1.75;">${paragraph1}</p>
        <p style="margin:14px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:14.5px;color:#44403c;line-height:1.75;">${paragraph2}</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- Meeting Card -->
  <tr><td style="padding:24px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:16px;">
      <tr><td style="padding:24px;">
        <p style="margin:0 0 18px;font-family:'Inter',system-ui,sans-serif;font-size:10px;font-weight:700;color:#a8a29e;letter-spacing:2px;text-transform:uppercase;">Detalhes da reuni&atilde;o</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
          <td width="36" valign="top"><div style="width:34px;height:34px;background:#ffffff;border:1px solid #e7e5e4;border-radius:10px;text-align:center;line-height:34px;font-size:15px;">&#128197;</div></td>
          <td style="padding-left:14px;" valign="middle"><p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#1c1917;">${escapeHtml(date)}</p></td>
        </tr></table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
          <td width="36" valign="top"><div style="width:34px;height:34px;background:#ffffff;border:1px solid #e7e5e4;border-radius:10px;text-align:center;line-height:34px;font-size:15px;">&#128336;</div></td>
          <td style="padding-left:14px;" valign="middle"><p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#1c1917;">${escapeHtml(time)}<span style="font-weight:400;color:#78716c;font-size:13px;">&nbsp;hor&aacute;rio de Bras&iacute;lia</span></p></td>
        </tr></table>

        <div style="height:1px;background:#e7e5e4;margin:0 0 16px;"></div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="36" valign="top"><div style="width:34px;height:34px;background:linear-gradient(135deg,#fb923c,#ea580c);border-radius:50%;text-align:center;line-height:34px;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:800;color:#ffffff;">${escapeHtml(specialistInitials)}</div></td>
          <td style="padding-left:14px;" valign="middle">
            <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#1c1917;">${escapeHtml(specialistName)}</p>
            <p style="margin:2px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:500;color:#a8a29e;">Especialista IAP</p>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:28px 40px 0;" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td align="center" style="border-radius:14px;background:#0a0a0a;">
        <a href="${escapeHtml(meetLink)}" target="_blank" style="display:block;padding:18px 48px;font-family:'Inter',system-ui,sans-serif;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.3px;text-align:center;">Entrar na reuni&atilde;o &nbsp;&rarr;</a>
      </td>
    </tr></table>
    <p style="margin:10px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:11px;color:#a8a29e;letter-spacing:0.3px;">${escapeHtml(meetLink.replace("https://", ""))}</p>
  </td></tr>

  <!-- Calendar buttons -->
  <tr><td style="padding:18px 40px 0;" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:6px;"><a href="${escapeHtml(gcalLink)}" target="_blank" style="display:inline-block;padding:9px 16px;background:#ffffff;border:1px solid #e7e5e4;border-radius:10px;font-family:'Inter',system-ui,sans-serif;color:#78716c;font-size:12px;font-weight:600;text-decoration:none;">+ Google Calendar</a></td>
      <td style="padding-left:6px;"><a href="${escapeHtml(outlookLink)}" target="_blank" style="display:inline-block;padding:9px 16px;background:#ffffff;border:1px solid #e7e5e4;border-radius:10px;font-family:'Inter',system-ui,sans-serif;color:#78716c;font-size:12px;font-weight:600;text-decoration:none;">+ Outlook</a></td>
    </tr></table>
  </td></tr>

  <!-- Reschedule -->
  <tr><td style="padding:24px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:14px 18px;">
        <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:13px;color:#78716c;line-height:1.6;">Precisa reagendar? Sem problema &mdash; responde pelo <strong style="color:#ea580c;">WhatsApp</strong> que a gente ajusta rapidinho.</p>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:32px 40px 0;"><div style="height:1px;background:#e7e5e4;"></div></td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 40px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle">
        <span style="font-family:'Inter',system-ui,sans-serif;font-size:16px;font-weight:900;color:#0a0a0a;letter-spacing:-0.3px;">IAP</span>
        <span style="font-family:'Inter',system-ui,sans-serif;font-size:11px;font-weight:500;color:#a8a29e;margin-left:6px;">Automa&ccedil;&atilde;o inteligente</span>
      </td>
      <td align="right" valign="middle">
        <a href="https://napratica.ai" style="font-family:'Inter',system-ui,sans-serif;font-size:12px;color:#f97316;text-decoration:none;font-weight:600;">napratica.ai</a>
      </td>
    </tr></table>
  </td></tr>

</table>
<p style="margin:20px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:11px;color:#a8a29e;text-align:center;">Este email foi enviado porque voc&ecirc; tem uma reuni&atilde;o agendada com a IAP.</p>
</td></tr></table>
</body></html>`;
}

// ─── Main Handler ─────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const input: EmailInput = await req.json();

    if (!input.lead_id || !input.email_type || !input.meeting_date) {
      return new Response(
        JSON.stringify({
          error: "lead_id, email_type e meeting_date são obrigatórios",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch lead
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", input.lead_id)
      .single();

    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead não encontrado" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!lead.email) {
      return new Response(
        JSON.stringify({ error: "Lead não tem email cadastrado" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Resolve specialist
    let specialistName = input.specialist_name || "Especialista IAP";
    if (input.specialist_id && !input.specialist_name) {
      const { data: member } = await supabase
        .from("team_members")
        .select("name")
        .eq("id", input.specialist_id)
        .single();
      if (member?.name) specialistName = member.name;
    }

    // 3. Fetch deal + product for context
    let productName = "";
    let productDesc = "";
    if (input.deal_id) {
      const { data: deal } = await supabase
        .from("deals")
        .select("*, product:products(name, description)")
        .eq("id", input.deal_id)
        .single();
      if (deal?.product) {
        productName = deal.product.name || "";
        productDesc = deal.product.description || "";
      }
    } else if (input.product_id) {
      const { data: product } = await supabase
        .from("products")
        .select("name, description")
        .eq("id", input.product_id)
        .single();
      if (product) {
        productName = product.name || "";
        productDesc = product.description || "";
      }
    }

    // 4. Fetch recent messages for context
    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("content, is_from_me")
      .eq("lead_id", input.lead_id)
      .order("created_at", { ascending: false })
      .limit(15);

    // 5. Build context for Haiku
    const leadContext = {
      name: lead.name,
      company: lead.company_name || "",
      challenges: lead.challenges || "",
      bant_need: lead.bant_need || "",
      bant_budget: lead.bant_budget || "",
      ai_insights: lead.ai_conversation_insights || null,
      product: productName,
      product_description: productDesc?.substring(0, 300) || "",
      recent_messages: (messages || [])
        .slice(0, 10)
        .map((m: any) => `${m.is_from_me ? "Vendedor" : "Lead"}: ${m.content?.substring(0, 150)}`)
        .join("\n"),
    };

    // 6. Call Haiku for personalized content
    let aiContent: AIContent;

    if (input.email_type === "scheduled") {
      // Generate 3 bullet topics
      const aiResponse = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 1024,
            messages: [
              {
                role: "user",
                content: `Você é o copywriter da IAP (IA na Prática). Gere 3 tópicos curtos (1 frase cada, max 15 palavras) que serão abordados na reunião de vendas com este lead. Baseie-se nos desafios e contexto abaixo.

CONTEXTO DO LEAD:
${JSON.stringify(leadContext, null, 2)}

REGRAS:
- Cada tópico deve ser específico para este lead (mencionar o negócio/produto dele)
- Use linguagem direta e prática
- Destaque benefícios concretos (automação, redução de custos, escala)
- Foque nos desafios mencionados pelo lead
- Se não há contexto suficiente, use tópicos genéricos sobre automação com IA

FORMATO: Responda APENAS com JSON array de 3 strings:
["tópico 1", "tópico 2", "tópico 3"]`,
              },
            ],
          }),
        }
      );

      const aiResult = await aiResponse.json();
      const text = aiResult.content?.[0]?.text || "";
      try {
        const match = text.match(/\[[\s\S]*\]/);
        aiContent = { topics: match ? JSON.parse(match[0]) : [] };
      } catch {
        aiContent = {
          topics: [
            "Como automatizar processos operacionais do seu negócio com IA",
            "Estratégias para escalar sem aumentar equipe",
            "Resultados reais de clientes no mesmo segmento",
          ],
        };
      }
    } else {
      // Generate 2 personalized paragraphs
      const aiResponse = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 1024,
            messages: [
              {
                role: "user",
                content: `Você é o copywriter da IAP (IA na Prática). Gere 2 parágrafos curtos (2-3 frases cada) personalizados para este lead que vai receber um lembrete de reunião.

CONTEXTO DO LEAD:
${JSON.stringify(leadContext, null, 2)}

REGRAS:
- Parágrafo 1: Referência ao desafio/dor do lead + como o produto resolve. Use <strong style="color:#0a0a0a;"> para destaques de negócio e <strong style="color:#ea580c;"> para destaques de resultado/benefício
- Parágrafo 2: O que o especialista vai mostrar + um resultado concreto (use números). Use as mesmas tags de destaque
- Linguagem informal mas profissional (você, pra, etc.)
- Max 3 frases por parágrafo
- NÃO use emoji

FORMATO: Responda APENAS com JSON:
{"paragraph1": "...", "paragraph2": "..."}`,
              },
            ],
          }),
        }
      );

      const aiResult = await aiResponse.json();
      const text = aiResult.content?.[0]?.text || "";
      try {
        const match = text.match(/\{[\s\S]*\}/);
        aiContent = match ? JSON.parse(match[0]) : {};
      } catch {
        aiContent = {
          paragraph1: `Você mencionou que quer <strong style="color:#0a0a0a;">escalar o seu negócio</strong> sem aumentar a complexidade operacional. Esse é exatamente o tipo de desafio que a IAP resolve com <strong style="color:#ea580c;">automação inteligente</strong>.`,
          paragraph2: `Na call, nosso especialista vai te mostrar como negócios parecidos com o seu <strong style="color:#ea580c;">reduziram até 70% do trabalho operacional</strong> nos primeiros 30 dias usando a <strong style="color:#0a0a0a;">PAIN</strong>.`,
        };
      }
    }

    // 7. Build HTML email
    const duration = input.meeting_duration_minutes || 60;
    const meetLink = input.meet_link || "";
    const dateFormatted = formatDatePtBR(input.meeting_date);
    const timeFormatted = formatTimePtBR(input.meeting_date);
    const initials = getInitials(specialistName);
    const { gcal: gcalLink, outlook: outlookLink } = buildCalendarLinks(
      input.meeting_date,
      duration,
      specialistName,
      meetLink
    );

    let html: string;
    let subject: string;
    const firstName = lead.name?.split(" ")[0] || "Olá";

    if (input.email_type === "scheduled") {
      subject = `${firstName}, sua reunião com a IAP está confirmada`;
      html = buildScheduledEmail({
        leadName: lead.name,
        date: dateFormatted,
        time: timeFormatted,
        duration,
        specialistName,
        specialistInitials: initials,
        meetLink,
        topics: aiContent.topics || [],
        gcalLink,
        outlookLink,
      });
    } else {
      subject = `${firstName}, tudo pronto pra nossa conversa`;
      html = buildReminderEmail({
        leadName: lead.name,
        date: dateFormatted,
        time: timeFormatted,
        duration,
        specialistName,
        specialistInitials: initials,
        meetLink,
        paragraph1: aiContent.paragraph1 || "",
        paragraph2: aiContent.paragraph2 || "",
        gcalLink,
        outlookLink,
      });
    }

    // 8. Send via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "IAP - IA na Prática <reuniao@napratica.ai>",
        to: [lead.email],
        subject,
        html,
      }),
    });

    const resendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend error:", resendResult);
      return new Response(
        JSON.stringify({
          error: "Erro ao enviar email",
          details: resendResult,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `✅ Email (${input.email_type}) enviado para ${lead.email}:`,
      resendResult
    );

    // 9. Registrar na timeline do lead (company_activities)
    const emailTypeLabel = input.email_type === "scheduled" ? "confirmação" : "lembrete";
    const { error: activityErr } = await supabase
      .from("company_activities")
      .insert({
        lead_id: input.lead_id,
        task_type: "email",
        name: subject,
        description: `Email de ${emailTypeLabel} de reunião enviado para ${lead.email}`,
        team: "sales",
        completed: true,
        status: "completed",
        metadata: {
          email_html: html,
          email_id: resendResult.id,
          email_type: input.email_type,
          email_subject: subject,
          email_to: lead.email,
          meeting_date: input.meeting_date,
          specialist_name: specialistName,
        },
      });

    if (activityErr) {
      console.error("⚠️ Erro ao registrar email na timeline:", activityErr);
    } else {
      console.log("📧 Email registrado na timeline do lead");
    }

    return new Response(
      JSON.stringify({
        success: true,
        email_id: resendResult.id,
        to: lead.email,
        type: input.email_type,
        subject,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
