// SankeyJornada — diagrama Sankey Origem → Captura → Destino
// Usado na página "Mapa da Jornada" do PDF e na Tela 5 do diagnóstico.

import { ResponsiveSankey } from "@nivo/sankey";
import type { AchadosCanal } from "../types";

interface Props {
  scoreMap: Record<string, number | null>;
  achadosMap: Record<string, AchadosCanal | null>;
  fontesConsultadas: string[];
}

interface Node {
  id: string;
  label: string;
  nodeColor: string;
  group: "origem" | "captura" | "destino";
  meta?: string;
}

interface Link {
  source: string;
  target: string;
  value: number;
}

export function SankeyJornada({ scoreMap, achadosMap, fontesConsultadas }: Props) {
  const igMet = (achadosMap.instagram?.metricas as any) || {};
  const ytMet = (achadosMap.youtube?.metricas as any) || {};
  const tkMet = (achadosMap.tiktok?.metricas as any) || {};
  const mapsMet = (achadosMap.google_maps?.metricas as any) || {};
  const metaAdsMet = (achadosMap.meta_ads?.metricas as any) || {};
  const googleAdsMet = (achadosMap.google_ads?.metricas as any) || {};
  const siteMet = (achadosMap.site?.metricas as any) || {};
  const psMet = (achadosMap.pagespeed?.metricas as any) || {};

  const nodes: Node[] = [];
  const links: Link[] = [];

  // ============================================================
  // ORIGEM (esquerda) — fontes de tráfego
  // ============================================================
  const origens: { id: string; label: string; color: string; volume: number }[] = [];

  if (fontesConsultadas.includes("meta_ads")) {
    const ads = metaAdsMet.ads_ativos ?? 0;
    origens.push({
      id: "origem_meta_ads",
      label: ads > 0 ? `Meta Ads · ${ads} ad${ads > 1 ? "s" : ""}` : "Meta Ads · inativo",
      color: ads > 0 ? "#3b82f6" : "#475569",
      volume: ads > 0 ? 80 + ads * 5 : 5,
    });
  }
  if (fontesConsultadas.includes("google_ads")) {
    const ads = googleAdsMet.ads_ativos ?? 0;
    origens.push({
      id: "origem_google_ads",
      label: ads > 0 ? `Google Ads · ${ads} criativos` : "Google Ads · inativo",
      color: ads > 0 ? "#0ea5e9" : "#475569",
      volume: ads > 0 ? 60 + ads * 5 : 5,
    });
  }
  if (fontesConsultadas.includes("instagram") && igMet.followers) {
    const f = igMet.followers as number;
    const label = f >= 1000 ? `Instagram · ${(f / 1000).toFixed(0)}k seg.` : `Instagram · ${f} seg.`;
    origens.push({
      id: "origem_instagram",
      label,
      color: "#ec4899",
      volume: Math.min(140, Math.round(Math.sqrt(f) / 2)),
    });
  }
  if (fontesConsultadas.includes("youtube") && ytMet.subs) {
    origens.push({
      id: "origem_youtube",
      label: `YouTube · ${ytMet.subs.toLocaleString("pt-BR")} inscr.`,
      color: "#ef4444",
      volume: Math.min(80, Math.round(Math.sqrt(ytMet.subs))),
    });
  }
  if (fontesConsultadas.includes("tiktok") && tkMet.followers) {
    origens.push({
      id: "origem_tiktok",
      label: `TikTok · ${tkMet.followers.toLocaleString("pt-BR")}`,
      color: "#14b8a6",
      volume: Math.min(80, Math.round(Math.sqrt(tkMet.followers))),
    });
  }
  if (fontesConsultadas.includes("google_maps") && mapsMet.qtd_reviews !== undefined) {
    const r = mapsMet.qtd_reviews ?? 0;
    origens.push({
      id: "origem_maps",
      label: r > 0 ? `Google Maps · ${r} reviews` : "Google Maps · 0 reviews",
      color: r > 0 ? "#22c55e" : "#475569",
      volume: r > 0 ? Math.min(80, 20 + r) : 5,
    });
  }
  // Tráfego orgânico/SEO (proxy: tem blog ou indexação)
  if (fontesConsultadas.includes("posicao_google")) {
    origens.push({
      id: "origem_organico",
      label: "Busca orgânica · SEO",
      color: "#a78bfa",
      volume: 30,
    });
  }

  // Fallback se nenhuma origem
  if (origens.length === 0) {
    origens.push({
      id: "origem_unknown",
      label: "Origem desconhecida",
      color: "#475569",
      volume: 50,
    });
  }

  // ============================================================
  // CAPTURA (meio) — touchpoints de conversão
  // ============================================================
  const capturas: { id: string; label: string; color: string }[] = [];

  // Site
  if (fontesConsultadas.includes("site")) {
    if (siteMet.has_form) {
      capturas.push({ id: "captura_form_site", label: "Form no site", color: "#f97316" });
    }
    if (siteMet.has_whatsapp) {
      capturas.push({
        id: "captura_whatsapp_site",
        label: "WhatsApp no site",
        color: "#22c55e",
      });
    }
    if (siteMet.tem_agendamento_online) {
      capturas.push({
        id: "captura_agendamento",
        label: `Agendamento · ${siteMet.sistema_agendamento || "online"}`,
        color: "#10b981",
      });
    }
  }
  // Bio link IG
  if (fontesConsultadas.includes("instagram") && igMet.link_bio) {
    capturas.push({
      id: "captura_bio_ig",
      label: "Bio link IG",
      color: "#ec4899",
    });
  }
  // DM IG (sempre que IG existe)
  if (fontesConsultadas.includes("instagram")) {
    capturas.push({ id: "captura_dm_ig", label: "DM Instagram", color: "#db2777" });
  }
  // Sem captura → cria caixa "sem captura"
  if (capturas.length === 0) {
    capturas.push({
      id: "captura_zero",
      label: "Sem captura ❌",
      color: "#ef4444",
    });
  }

  // ============================================================
  // DESTINO (direita) — onde o lead acaba
  // ============================================================
  const destinos: { id: string; label: string; color: string }[] = [];

  // Tem CRM/Pixel?
  const temPixel = !!siteMet.tem_meta_pixel || !!siteMet.tem_ga4;
  if (temPixel) {
    destinos.push({
      id: "destino_crm",
      label: "CRM / Tracking ✓",
      color: "#22c55e",
    });
  }

  // Vazamentos
  const semWa = fontesConsultadas.includes("site") && !siteMet.has_whatsapp;
  const semForm = fontesConsultadas.includes("site") && !siteMet.has_form;
  const semAgendamento = fontesConsultadas.includes("site") && !siteMet.tem_agendamento_online;

  if (semWa || semForm || semAgendamento || !temPixel) {
    destinos.push({
      id: "destino_vazamento",
      label: "💧 Vazamento",
      color: "#ef4444",
    });
  }

  // Lead qualificado (default)
  destinos.push({
    id: "destino_lead",
    label: "Lead qualificado",
    color: "#c8952e",
  });

  // ============================================================
  // Monta nodes
  // ============================================================
  for (const o of origens) {
    nodes.push({ id: o.id, label: o.label, nodeColor: o.color, group: "origem" });
  }
  for (const c of capturas) {
    nodes.push({ id: c.id, label: c.label, nodeColor: c.color, group: "captura" });
  }
  for (const d of destinos) {
    nodes.push({ id: d.id, label: d.label, nodeColor: d.color, group: "destino" });
  }

  // ============================================================
  // Monta links
  // ============================================================
  // Origem → Captura: distribui o volume da origem entre as capturas disponíveis
  for (const o of origens) {
    const numCapturas = capturas.length;
    const valuePerCaptura = Math.max(1, Math.round(o.volume / numCapturas));
    for (const c of capturas) {
      links.push({ source: o.id, target: c.id, value: valuePerCaptura });
    }
  }

  // Captura → Destino
  // Se captura é "Sem captura ❌" → tudo vaza
  // Senão: 60% lead, 40% vazamento (se vazamento existe), ou 100% lead
  for (const c of capturas) {
    const valEntrada = origens.length * Math.max(1, Math.round(60 / capturas.length));

    if (c.id === "captura_zero") {
      // Tudo vaza
      links.push({ source: c.id, target: "destino_vazamento", value: valEntrada });
      continue;
    }

    const temVazamento = destinos.some((d) => d.id === "destino_vazamento");
    const temCrm = destinos.some((d) => d.id === "destino_crm");

    if (temVazamento) {
      const leadShare = temCrm ? 0.5 : 0.6;
      const vazShare = 1 - leadShare;
      links.push({
        source: c.id,
        target: "destino_lead",
        value: Math.max(1, Math.round(valEntrada * leadShare)),
      });
      links.push({
        source: c.id,
        target: "destino_vazamento",
        value: Math.max(1, Math.round(valEntrada * vazShare)),
      });
      if (temCrm) {
        links.push({
          source: c.id,
          target: "destino_crm",
          value: Math.max(1, Math.round(valEntrada * 0.2)),
        });
      }
    } else {
      links.push({ source: c.id, target: "destino_lead", value: valEntrada });
      if (temCrm) {
        links.push({ source: c.id, target: "destino_crm", value: Math.round(valEntrada * 0.3) });
      }
    }
  }

  // Garante labels únicos (Nivo usa id pra match — usamos label como id)
  const idToLabel = new Map<string, string>();
  for (const n of nodes) {
    let label = n.label;
    let suffix = 1;
    while (Array.from(idToLabel.values()).includes(label)) {
      label = `${n.label} (${suffix++})`;
    }
    idToLabel.set(n.id, label);
  }

  const sankeyNodes = nodes.map((n) => ({
    id: idToLabel.get(n.id)!,
    nodeColor: n.nodeColor,
  }));
  const sankeyLinks = links
    .filter((l) => idToLabel.has(l.source) && idToLabel.has(l.target))
    .map((l) => ({
      source: idToLabel.get(l.source)!,
      target: idToLabel.get(l.target)!,
      value: l.value,
    }));

  return (
    <div className="sankey-wrapper">
      <ResponsiveSankey
        data={{ nodes: sankeyNodes, links: sankeyLinks }}
        margin={{ top: 16, right: 200, bottom: 16, left: 20 }}
        align="justify"
        colors={(node: any) => node.nodeColor || "#475569"}
        nodeOpacity={1}
        nodeHoverOpacity={1}
        nodeThickness={18}
        nodeSpacing={14}
        nodeBorderWidth={0}
        nodeBorderRadius={6}
        linkOpacity={0.4}
        linkHoverOpacity={0.7}
        linkContract={2}
        enableLinkGradient={true}
        labelPosition="outside"
        labelOrientation="horizontal"
        labelPadding={10}
        labelTextColor="#f8f6f1"
        animate={false}
        theme={{
          background: "transparent",
          text: { fill: "#f8f6f1", fontSize: 11, fontFamily: "Inter, sans-serif" },
          tooltip: { container: { background: "#1a1a20", color: "#f8f6f1" } },
        }}
      />
    </div>
  );
}
