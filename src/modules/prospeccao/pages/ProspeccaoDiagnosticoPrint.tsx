// PDF Diagnóstico — layout v3 (8 páginas A4 estilo consultoria premium)
// Cmd/Ctrl+P → "Salvar como PDF" (auto-dispara após 1.5s)

import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useDiagnostico, useLeadDescoberto } from "../hooks/useProspeccao";

// Proxy weserv pra contornar CORS de imagens IG/CDN
function proxyImg(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.includes("weserv.nl")) return url;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ""))}`;
}

function tierFromScore(score: number | null | undefined): "alta" | "media" | "baixa" | "na" {
  if (score === null || score === undefined) return "na";
  if (score < 4) return "alta";
  if (score < 7) return "media";
  return "baixa";
}

function tierLabel(tier: "alta" | "media" | "baixa" | "na"): string {
  if (tier === "alta") return "🔥 ALTA DOR · OPORTUNIDADE";
  if (tier === "media") return "⚠️ MÉDIA DOR · VALE A PENA";
  if (tier === "baixa") return "✅ BAIXA DOR · LEAD MADURO";
  return "— SEM DADOS";
}

export default function ProspeccaoDiagnosticoPrint() {
  const { diagnosticoId } = useParams<{ diagnosticoId: string }>();
  const { data: diag, isLoading } = useDiagnostico(diagnosticoId);
  const { data: lead } = useLeadDescoberto(diag?.lead_descoberto_id);

  useEffect(() => {
    if (diag && lead) {
      const t = setTimeout(() => window.print(), 1500);
      return () => clearTimeout(t);
    }
  }, [diag, lead]);

  if (isLoading || !diag || !lead) {
    return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Carregando diagnóstico...</div>;
  }

  const d = diag as any;
  const ctx = (d.achados_contexto_negocio?.metricas as any) || {};
  const ig = (d.achados_instagram?.metricas as any) || {};
  const igAchados = d.achados_instagram || {};
  const site = (d.achados_site?.metricas as any) || {};
  const siteAchados = d.achados_site || {};
  const ads = (d.achados_meta_ads?.metricas as any) || {};
  const adsAchados = d.achados_meta_ads || {};

  const scoreGeral = Number(diag.score_geral || 0);
  const tierGeral = tierFromScore(scoreGeral);

  const scoreAtracao = d.score_atracao;
  const scoreQual = d.score_qualificacao;
  const scoreConv = d.score_conversao;
  const scoreRet = d.score_retencao;

  const dataFmt = new Date(diag.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const oportunidades = Array.isArray(diag.oportunidades) ? (diag.oportunidades as any[]) : [];
  const headLead = lead.instagram_handle ? `@${lead.instagram_handle}` : lead.nome;

  // IG data
  const igPosts = Array.isArray(ig.posts_recentes) ? ig.posts_recentes.slice(0, 6) : [];
  const igHashtags = Array.isArray(ig.top_hashtags) ? ig.top_hashtags.slice(0, 10) : [];
  const igPilares = ig.ai_pilares_posicionamento || ig.ai_pilares || null;
  const igBioFramework = ig.ai_bio_framework || null;
  const igTiposConteudo = ig.ai_tipos_conteudo || null;
  const igDestaques = ig.ai_destaques_estrategicos || ig.ai_checklist_destaques || null;
  const igErros = Array.isArray(ig.ai_erros_amadores) ? ig.ai_erros_amadores : [];
  const igCodigos = ig.ai_codigos_autoridade || null;
  const igVeredicto = ig.ai_veredicto_frank_costa || ig.ai_veredicto || "";

  // Meta Ads
  const adsAtivos = Array.isArray(ads.ads) ? ads.ads.slice(0, 3) : [];

  // Achados (positivos/atencao/problemas) por fonte
  const igProblemas = igAchados.problemas || [];
  const igAtencao = igAchados.atencao || [];
  const igPositivos = igAchados.positivos || [];

  const siteProblemas = siteAchados.problemas || [];
  const siteAtencao = siteAchados.atencao || [];
  const sitePositivos = siteAchados.positivos || [];

  const adsProblemas = adsAchados.problemas || [];
  const adsAtencao = adsAchados.atencao || [];
  const adsPositivos = adsAchados.positivos || [];

  return (
    <>
      <style>{PRINT_STYLES}</style>
      <button type="button" className="print-tip" onClick={() => window.print()}>🖨️ Salvar como PDF</button>

      {/* ============ PÁGINA 1 — CAPA ============ */}
      <section className="page page-dark">
        <div className="cover-grid">
          <div className="cover-top">
            <div className="cover-logo">
              <div className="cover-logo-mark">D</div>
              <div className="cover-logo-text">Diagnóstico</div>
            </div>
            <div className="cover-meta-right">
              <div>{dataFmt}</div>
              <div>Confidencial</div>
            </div>
          </div>

          <div className="cover-hero">
            <div className="cover-tag">
              <span className="cover-tag-dot"></span>Diagnóstico Digital · Auditoria 360°
            </div>
            {ctx.segmento && <div className="cover-segment">{ctx.segmento}</div>}
            <h1 className="cover-name">
              {lead.nome.replace(/^@/, "")}
              {lead.instagram_handle && (<><br /><span style={{ color: "#c8952e" }}>@{lead.instagram_handle}</span></>)}
            </h1>
            {ctx.posicionamento && <p className="cover-positioning">"{ctx.posicionamento}"</p>}
            <div className="cover-meta-line">
              {lead.url_site && <span>🌐 {lead.url_site.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>}
              {lead.instagram_handle && ig.followers && <span>📸 @{lead.instagram_handle} · {(ig.followers / 1000).toFixed(1)}k</span>}
              {lead.youtube_url && <span>📺 {lead.youtube_url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 30)}</span>}
            </div>
          </div>

          <div className="cover-score-row">
            <div className="cover-score-big">
              <div className={`cover-score-tier tier-${tierGeral}`}>{tierLabel(tierGeral)}</div>
              <div className="cover-score-num" style={{ color: tierGeral === "alta" ? "#f87171" : tierGeral === "media" ? "#fbbf24" : "#4ade80" }}>
                {scoreGeral.toFixed(1)}<span>/10</span>
              </div>
            </div>
            <div className="cover-pillars">
              <div className={`cover-pillar tier-${tierFromScore(scoreAtracao)}`}>
                <div className="cover-pillar-label">🎯 Atração</div>
                <div className="cover-pillar-score">{scoreAtracao !== null && scoreAtracao !== undefined ? Number(scoreAtracao).toFixed(1) : "—"}</div>
              </div>
              <div className={`cover-pillar tier-${tierFromScore(scoreQual)}`}>
                <div className="cover-pillar-label">🔍 Qualificação</div>
                <div className="cover-pillar-score">{scoreQual !== null && scoreQual !== undefined ? Number(scoreQual).toFixed(1) : "—"}</div>
              </div>
              <div className={`cover-pillar tier-${tierFromScore(scoreConv)}`}>
                <div className="cover-pillar-label">💸 Conversão</div>
                <div className="cover-pillar-score">{scoreConv !== null && scoreConv !== undefined ? Number(scoreConv).toFixed(1) : "—"}</div>
              </div>
              <div className={`cover-pillar tier-${tierFromScore(scoreRet)}`}>
                <div className="cover-pillar-label">🔄 Retenção</div>
                <div className="cover-pillar-score">{scoreRet !== null && scoreRet !== undefined ? Number(scoreRet).toFixed(1) : "—"}</div>
              </div>
            </div>
          </div>

          <div className="cover-foot">
            <div>Preparado por <strong style={{ color: "#c8952e" }}>Sua Empresa · Diagnóstico de Prospecção</strong></div>
            <div className="cover-foot-page">01</div>
          </div>
        </div>
      </section>

      {/* ============ PÁGINA 2 — CONTEXTO DO NEGÓCIO ============ */}
      {Object.keys(ctx).length > 0 && (
        <section className="page">
          <div className="head">
            <div className="head-section">🧠 Contexto do Negócio</div>
            <div className="head-lead">{headLead}</div>
            <div className="head-page">02</div>
          </div>

          <div className="section-eyebrow">Quem é</div>
          <h2 className="section-title">{ctx.tipo_negocio || "Negócio"}</h2>
          <p className="section-intro">Análise de inteligência extraída do site oficial via IA — mapeia tipo de negócio, posicionamento, persona, modelo de receita e palavras-chave estratégicas.</p>

          {ctx.posicionamento && (
            <div className="context-summary">
              <div className="context-summary-eyebrow">📍 Posicionamento</div>
              <p className="context-summary-text">{ctx.posicionamento}</p>
            </div>
          )}

          <div className="context-grid">
            {ctx.segmento && <Card label="Segmento" value={ctx.segmento} />}
            {ctx.estagio_maturidade && <Card label="Maturidade" value={ctx.estagio_maturidade} />}
            {ctx.modelo_receita && <Card label="Modelo" value={ctx.modelo_receita} />}
            {ctx.precos?.faixa_visivel && <Card label="Faixa visível" value={ctx.precos.faixa_visivel} />}
            {ctx.precos?.ticket_medio_estimado && <Card label="Ticket médio" value={ctx.precos.ticket_medio_estimado} />}
            {ctx.precos?.modelo && <Card label="Modelo preço" value={ctx.precos.modelo} />}
          </div>

          {ctx.publico_alvo && (
            <>
              <div className="block-title">Público-alvo</div>
              <div className="context-block"><p className="context-block-text">{ctx.publico_alvo}</p></div>
            </>
          )}

          {Array.isArray(ctx.produtos_servicos) && ctx.produtos_servicos.length > 0 && (
            <>
              <div className="block-title">📦 Produtos / Serviços</div>
              <div className="context-block">
                <ul className="context-list">
                  {ctx.produtos_servicos.map((p: string, i: number) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            </>
          )}

          {Array.isArray(ctx.diferenciais) && ctx.diferenciais.length > 0 && (
            <>
              <div className="block-title">⭐ Diferenciais</div>
              <div className="context-block">
                <ul className="context-list">
                  {ctx.diferenciais.map((p: string, i: number) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            </>
          )}

          {ctx.sinal_de_dor_mais_obvio && (
            <>
              <div className="block-title">🎯 Dor que ele resolve</div>
              <div className="context-block context-pain">
                <p className="context-block-text">{ctx.sinal_de_dor_mais_obvio}</p>
              </div>
            </>
          )}

          {Array.isArray(ctx.palavras_chave_seo) && ctx.palavras_chave_seo.length > 0 && (
            <>
              <div className="block-title">🔑 Palavras-chave SEO</div>
              <div className="tag-cloud">
                {ctx.palavras_chave_seo.map((p: string, i: number) => <span key={i} className="tag-pill">{p}</span>)}
              </div>
            </>
          )}

          {Array.isArray(ctx.concorrentes_mencionados) && ctx.concorrentes_mencionados.length > 0 && (
            <>
              <div className="block-title" style={{ marginTop: 18 }}>⚔️ Concorrentes mencionados no site</div>
              <div className="competitors">
                {ctx.concorrentes_mencionados.map((c: string, i: number) => <span key={i} className="competitor">{c}</span>)}
              </div>
            </>
          )}
        </section>
      )}

      {/* ============ PÁGINA 3 — INSTAGRAM RICH ============ */}
      {Object.keys(ig).length > 0 && (
        <section className="page">
          <div className="head">
            <div className="head-section">📸 Atração · Instagram</div>
            <div className="head-lead">{headLead}</div>
            <div className="head-page">03</div>
          </div>

          <div className="ig-hero">
            {ig.profile_pic_url && (
              <div className="ig-avatar">
                <img src={proxyImg(ig.profile_pic_url)} alt={ig.full_name || "perfil"} />
              </div>
            )}
            <div className="ig-info">
              <div className="ig-handle-row">
                <span className="ig-handle">@{ig.handle}</span>
                {ig.is_verified && <span className="ig-badge ig-badge-verified">✓ Verificado</span>}
                {ig.is_business && <span className="ig-badge ig-badge-biz">Business</span>}
              </div>
              <div className="ig-fullname">{ig.full_name || ""}</div>
              {ig.bio && <p className="ig-bio">"{ig.bio}"</p>}
              {ig.bio_link_destination_host && (
                <p className="ig-biolink">🔗 Bio link → <strong>{ig.bio_link_destination_host}</strong></p>
              )}
            </div>
            <div className={`ig-score score-bg-${tierFromScore(diag.score_instagram)}`}>
              <div className="ig-score-num">{diag.score_instagram ?? "—"}</div>
              <div className="ig-score-of">/10</div>
            </div>
          </div>

          <div className="kpis">
            <Kpi label="Seguidores" value={ig.followers ? ig.followers.toLocaleString("pt-BR") : "—"} />
            <Kpi label="Posts totais" value={ig.posts ? ig.posts.toLocaleString("pt-BR") : "—"} sub={ig.ratio ? `ratio ${ig.ratio.toFixed(1)}` : undefined} />
            <Kpi label="Posts últ. 30d" value={ig.posts_per_month ?? "—"} sub={ig.posts_per_month >= 4 ? "cadência ✓" : "abaixo do ideal"} warn={ig.posts_per_month !== undefined && ig.posts_per_month < 4} />
            <Kpi label="Engajamento" value={ig.engagement_rate !== undefined ? `${ig.engagement_rate.toFixed(2)}%` : "—"} sub={ig.avg_likes ? `${ig.avg_likes} likes · ${ig.avg_comments} com.` : undefined} warn={ig.engagement_rate !== undefined && ig.engagement_rate < 1} />
            <Kpi label="Highlights" value={ig.highlight_count ?? 0} />
            <Kpi label="Último post" value={ig.dias_desde_ultimo_post !== undefined ? (ig.dias_desde_ultimo_post === 0 ? "hoje" : `há ${ig.dias_desde_ultimo_post}d`) : "—"} warn={ig.dias_desde_ultimo_post !== undefined && ig.dias_desde_ultimo_post > 7} />
          </div>

          {(ig.pct_reels !== undefined || ig.pct_carousel !== undefined || ig.pct_image !== undefined) && (
            <div className="mix-block">
              <div className="mix-title">📊 Mix de conteúdo · últimos posts</div>
              <MixRow label="🎬 Reels" pct={ig.pct_reels || 0} color="#dc2626" />
              <MixRow label="🖼️ Carousel" pct={ig.pct_carousel || 0} color="#b45309" />
              <MixRow label="📷 Foto" pct={ig.pct_image || 0} color="#047857" />
            </div>
          )}

          {igPosts.length > 0 && (
            <>
              <div className="block-title">📜 Últimos posts analisados</div>
              <div className="posts-grid">
                {igPosts.map((p: any, i: number) => (
                  <div key={i} className="post-card">
                    {p.thumb && <div className="post-thumb"><img src={proxyImg(p.thumb)} alt="post" /></div>}
                    <div className="post-header">
                      <span className={`post-tipo ${p.tipo || ""}`}>
                        {p.tipo === "reel" ? "🎬 reel" : p.tipo === "carousel" ? "🖼️ carousel" : "📷 image"}
                      </span>
                      {p.data && <span>{new Date(p.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>}
                    </div>
                    {p.caption_preview && <p className="post-caption">{p.caption_preview}</p>}
                    <div className="post-stats">
                      <span>❤️ {(p.likes || 0).toLocaleString("pt-BR")}</span>
                      <span>💬 {(p.comments || 0).toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {igHashtags.length > 0 && (
            <div className="hashtags-block">
              <div className="mix-title">🏷️ Hashtags mais usadas</div>
              <div className="tag-cloud">
                {igHashtags.map((h: string, i: number) => <span key={i} className="tag-pill">{h}</span>)}
              </div>
            </div>
          )}

          {(igProblemas.length > 0 || igAtencao.length > 0 || igPositivos.length > 0) && (
            <div className="findings">
              {igProblemas.length > 0 && (
                <div className="finding finding-prob">
                  <div className="finding-title">⛔ Problemas ({igProblemas.length})</div>
                  <ul>{igProblemas.map((p: any, i: number) => (
                    <li key={i}>{p.severidade === "alta" && <span className="sev-tag">ALTA</span>}{p.texto}</li>
                  ))}</ul>
                </div>
              )}
              {igPositivos.length > 0 && (
                <div className="finding finding-pos">
                  <div className="finding-title">✅ Pontos fortes ({igPositivos.length})</div>
                  <ul>{igPositivos.map((p: any, i: number) => <li key={i}>{p.texto}</li>)}</ul>
                </div>
              )}
              {igAtencao.length > 0 && (
                <div className="finding finding-att">
                  <div className="finding-title">🎯 Oportunidade</div>
                  <ul>{igAtencao.map((p: any, i: number) => <li key={i}>{p.texto}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {(ig.ai_posicionamento || ig.ai_persona_alvo || ig.ai_tom_voz) && (
            <div className="ai-block">
              <div className="ai-title">🤖 Análise estratégica · IA</div>
              {ig.ai_posicionamento && <div className="ai-row"><strong>📍 Posicionamento:</strong> {ig.ai_posicionamento}</div>}
              {ig.ai_persona_alvo && <div className="ai-row"><strong>👤 Persona-alvo:</strong> {ig.ai_persona_alvo}</div>}
              {ig.ai_tom_voz && <div className="ai-row"><strong>🗣️ Tom de voz:</strong> {ig.ai_tom_voz}</div>}
              {Array.isArray(ig.ai_pilares_conteudo) && ig.ai_pilares_conteudo.length > 0 && (
                <div className="ai-row"><strong>🏛️ Pilares de conteúdo:</strong>
                  <ul className="ai-list">{ig.ai_pilares_conteudo.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              {Array.isArray(ig.ai_gaps) && ig.ai_gaps.length > 0 && (
                <div className="ai-row"><strong>⚠️ Gaps detectados:</strong>
                  <ul className="ai-list ai-list-warn">{ig.ai_gaps.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              {Array.isArray(ig.ai_recomendacoes) && ig.ai_recomendacoes.length > 0 && (
                <div className="ai-row"><strong>✅ Recomendações práticas:</strong>
                  <ul className="ai-list ai-list-good">{ig.ai_recomendacoes.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ============ PÁGINA 4 — META ADS ============ */}
      {(d.score_meta_ads !== null || adsAtivos.length > 0) && (
        <section className="page">
          <div className="head">
            <div className="head-section">📱 Atração · Meta Ads</div>
            <div className="head-lead">{headLead}</div>
            <div className="head-page">04</div>
          </div>

          <div className="pilar-banner">
            <div className="pilar-banner-emoji">📱</div>
            <div className="pilar-banner-info">
              <div className="pilar-banner-eyebrow">CANAL DE TRÁFEGO PAGO</div>
              <div className="pilar-banner-title">Meta Ads · FB + IG</div>
              <div className="pilar-banner-desc">Anúncios ativos detectados na Meta Ad Library</div>
            </div>
            <div className={`pilar-banner-score tier-${tierFromScore(d.score_meta_ads)}`}>
              <div className="pilar-banner-score-num">{d.score_meta_ads ?? "—"}</div>
              <div className="pilar-banner-score-of">/10</div>
            </div>
          </div>

          <div className="kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <Kpi label="Anúncios ativos" value={ads.total_ativos ?? adsAtivos.length} sub={ads.page_name ? `page: ${ads.page_name}` : undefined} warn={(ads.total_ativos ?? adsAtivos.length) < 3} />
            <Kpi label="CTA principal" value={ads.cta_principal || "—"} small />
            <Kpi label="Plataformas" value={ads.plataformas || "FB + IG"} small />
            <Kpi label="Status escala" value={(ads.total_ativos ?? adsAtivos.length) >= 5 ? "Boa" : "Limitado"} small warn={(ads.total_ativos ?? adsAtivos.length) < 5} />
          </div>

          {adsAtivos.length > 0 && (
            <div className="ads-section">
              <div className="ads-title">🎬 Criativos ativos · amostra</div>
              {adsAtivos.map((ad: any, i: number) => (
                <div key={i} className="ad-card">
                  <div className="ad-header">
                    <span className="ad-tag ad-tag-active">● ATIVO</span>
                    {ad.cta && <span className="ad-tag ad-tag-cta">CTA: {ad.cta}</span>}
                    {ad.page_name && <span className="ad-tag">page: {ad.page_name}</span>}
                  </div>
                  {ad.body && <p className="ad-body">"{ad.body}"</p>}
                </div>
              ))}
            </div>
          )}

          {(adsProblemas.length > 0 || adsAtencao.length > 0 || adsPositivos.length > 0) && (
            <div className="findings">
              {adsProblemas.length > 0 && <div className="finding finding-prob"><div className="finding-title">⛔ Problemas</div><ul>{adsProblemas.map((p: any, i: number) => <li key={i}>{p.severidade === "alta" && <span className="sev-tag">ALTA</span>}{p.texto}</li>)}</ul></div>}
              {adsAtencao.length > 0 && <div className="finding finding-att"><div className="finding-title">⚠️ Atenção</div><ul>{adsAtencao.map((p: any, i: number) => <li key={i}>{p.texto}</li>)}</ul></div>}
              {adsPositivos.length > 0 && <div className="finding finding-pos"><div className="finding-title">✅ Positivos</div><ul>{adsPositivos.map((p: any, i: number) => <li key={i}>{p.texto}</li>)}</ul></div>}
            </div>
          )}
        </section>
      )}

      {/* ============ PÁGINA 5 — SITE ============ */}
      {Object.keys(site).length > 0 && (
        <section className="page">
          <div className="head">
            <div className="head-section">🔍 Qualificação · Site</div>
            <div className="head-lead">{headLead}</div>
            <div className="head-page">05</div>
          </div>

          <div className="pilar-banner">
            <div className="pilar-banner-emoji">🌐</div>
            <div className="pilar-banner-info">
              <div className="pilar-banner-eyebrow">PORTAL DE CONVERSÃO</div>
              <div className="pilar-banner-title">{site.domain || (lead.url_site || "").replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
              <div className="pilar-banner-desc">Quando o lead chega ao site, ele se qualifica?</div>
            </div>
            <div className={`pilar-banner-score tier-${tierFromScore(diag.score_site)}`}>
              <div className="pilar-banner-score-num">{diag.score_site ?? "—"}</div>
              <div className="pilar-banner-score-of">/10</div>
            </div>
          </div>

          <div className="kpis" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
            <Kpi label="HTTPS" value={site.has_https ? "Sim ✓" : "Não ✗"} small warn={!site.has_https} />
            <Kpi label="Mobile" value={site.has_viewport ? "OK ✓" : "Quebra ✗"} small warn={!site.has_viewport} />
            <Kpi label="WhatsApp" value={site.has_whatsapp ? "Sim ✓" : "Não ✗"} small warn={!site.has_whatsapp} />
            <Kpi label="Form" value={site.has_form ? `Sim · ${site.form_fields ?? ""}` : "Não"} small warn={!site.has_form} />
            <Kpi label="Lead Magnet" value={site.has_lead_magnet ? (site.lead_magnet_text?.[0] || "Sim") : "Não"} small warn={!site.has_lead_magnet} />
            <Kpi label="Preço" value={site.tem_preco_visivel ? "Visível" : "Oculto"} small warn={!site.tem_preco_visivel} />
          </div>

          {Array.isArray(site.precos_detectados) && site.precos_detectados.length > 0 && (
            <>
              <div className="block-title">💸 Preços detectados na página</div>
              <div className="tag-cloud" style={{ marginBottom: 16 }}>
                {site.precos_detectados.map((p: string, i: number) => (
                  <span key={i} className="tag-pill" style={{ background: "#dcfce7", color: "#166534", fontSize: 14, padding: "8px 14px", fontWeight: 700 }}>{p.toUpperCase()}</span>
                ))}
              </div>
            </>
          )}

          {Array.isArray(site.pixels_detectados) && (
            <>
              <div className="block-title">🔌 Pixels detectados</div>
              <div className="kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 16 }}>
                <Kpi label="Google Analytics" value={site.tem_ga4 ? "✓ Ativo" : "✗ Faltando"} small warn={!site.tem_ga4} />
                <Kpi label="Meta Pixel" value={site.tem_meta_pixel ? "✓ Ativo" : "✗ Faltando"} small warn={!site.tem_meta_pixel} />
                <Kpi label="GTM" value={site.tem_gtm ? "✓ Ativo" : "✗ Faltando"} small warn={!site.tem_gtm} />
                <Kpi label="TikTok Pixel" value={(site.pixels_detectados || []).includes("TikTok") ? "✓ Ativo" : "✗ Faltando"} small warn={!(site.pixels_detectados || []).includes("TikTok")} />
              </div>
            </>
          )}

          {(siteProblemas.length > 0 || siteAtencao.length > 0 || sitePositivos.length > 0) && (
            <div className="findings">
              {siteProblemas.length > 0 && <div className="finding finding-prob"><div className="finding-title">⛔ Problemas críticos ({siteProblemas.length})</div><ul>{siteProblemas.map((p: any, i: number) => <li key={i}>{p.severidade === "alta" && <span className="sev-tag">ALTA</span>}{p.texto}</li>)}</ul></div>}
              {siteAtencao.length > 0 && <div className="finding finding-att"><div className="finding-title">⚠️ Atenção ({siteAtencao.length})</div><ul>{siteAtencao.map((p: any, i: number) => <li key={i}>{p.texto}</li>)}</ul></div>}
              {sitePositivos.length > 0 && <div className="finding finding-pos"><div className="finding-title">✅ Pontos fortes ({sitePositivos.length})</div><ul>{sitePositivos.map((p: any, i: number) => <li key={i}>{p.texto}</li>)}</ul></div>}
            </div>
          )}
        </section>
      )}

      {/* ============ PÁGINA 5.5 — ANÁLISE FRANK COSTA ============ */}
      {(igPilares || igBioFramework || igTiposConteudo || igVeredicto) && (
        <section className="page">
          <div className="head">
            <div className="head-section">💬 Análise · Posicionamento</div>
            <div className="head-lead">{headLead}</div>
            <div className="head-page">5.5</div>
          </div>

          <div className="section-eyebrow">Diagnóstico de autoridade digital</div>
          <h2 className="section-title">Framework dos 5 Pilares + Bio Matadora + Conteúdo</h2>
          <p className="section-intro">Análise estratégica em 7 dimensões — pilares de posicionamento, bio framework, tipos de conteúdo essenciais, destaques, erros amadores e códigos de autoridade.</p>

          {igPilares && (
            <>
              <div className="block-title">📐 Pilares de Posicionamento</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 20 }}>
                {(["clareza", "foco", "promessa", "prova", "personalidade"] as const).map((p) => {
                  const pilar = igPilares[p];
                  if (!pilar) return null;
                  const nota = typeof pilar === "object" ? pilar.nota || pilar.score || 0 : 0;
                  const obs = typeof pilar === "object" ? pilar.comentario || pilar.observacao || "" : String(pilar);
                  const color = nota >= 8 ? "#16a34a" : nota >= 5 ? "#eab308" : "#dc2626";
                  return (
                    <div key={p} className="pilar-bar">
                      <div className="pilar-bar-label">{p}</div>
                      <div className="pilar-bar-track"><div className="pilar-bar-fill" style={{ width: `${nota * 10}%`, background: color }} /></div>
                      <div className="pilar-bar-num" style={{ color }}>{nota}</div>
                      <div className="pilar-bar-obs">{obs}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {igBioFramework && (
            <>
              <div className="block-title">🧬 Bio Framework {igBioFramework.nota_global !== undefined && `· score ${igBioFramework.nota_global}/10`}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {[
                  { key: "linha1_oque", label: "L1 · O que faz" },
                  { key: "linha2_paraquem", label: "L2 · Pra quem" },
                  { key: "linha3_como", label: "L3 · Como" },
                  { key: "linha4_cta", label: "L4 · CTA" },
                ].map((item) => {
                  const val = igBioFramework[item.key];
                  if (!val) return null;
                  const isOk = String(val).length > 4;
                  return (
                    <div key={item.key} className={`bio-line ${isOk ? "bio-ok" : "bio-warn"}`}>
                      <div className="bio-status">{isOk ? "✓" : "△"}</div>
                      <div className="bio-content"><strong>{item.label}:</strong> "{String(val)}"</div>
                      <div className="bio-obs">{igBioFramework.comentario || ""}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {igTiposConteudo && (
            <>
              <div className="block-title">📝 Tipos de Conteúdo Essenciais</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
                {[
                  { key: "autoridade", label: "Autoridade" },
                  { key: "transformacao", label: "Transformação" },
                  { key: "bastidores", label: "Bastidores" },
                  { key: "objecoes", label: "Objeções" },
                  { key: "provas_sociais", label: "Provas Sociais" },
                  { key: "cta", label: "CTA" },
                ].map((t) => {
                  const has = igTiposConteudo[t.key] === true || (typeof igTiposConteudo[t.key] === "object" && igTiposConteudo[t.key]?.tem === true);
                  const obs = typeof igTiposConteudo[t.key] === "object" ? igTiposConteudo[t.key]?.observacao || "" : "";
                  return (
                    <div key={t.key} className={`content-type ${has ? "ct-ok" : "ct-fail"}`}>
                      <div className="ct-icon">{has ? "✓" : "✗"}</div>
                      <div><strong>{t.label}</strong>{obs && <div className="ct-obs">{obs}</div>}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {igCodigos && (Array.isArray(igCodigos.usados) || Array.isArray(igCodigos.faltando)) && (
            <>
              <div className="block-title">🏆 Códigos de Autoridade</div>
              <div className="findings" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 20 }}>
                {Array.isArray(igCodigos.usados) && igCodigos.usados.length > 0 && (
                  <div className="finding finding-pos">
                    <div className="finding-title">✅ Já usa ({igCodigos.usados.length})</div>
                    <ul>{igCodigos.usados.map((u: string, i: number) => <li key={i}>{u}</li>)}</ul>
                  </div>
                )}
                {Array.isArray(igCodigos.faltando) && igCodigos.faltando.length > 0 && (
                  <div className="finding finding-prob">
                    <div className="finding-title">⛔ Falta usar ({igCodigos.faltando.length})</div>
                    <ul>{igCodigos.faltando.map((u: string, i: number) => <li key={i}>{u}</li>)}</ul>
                  </div>
                )}
              </div>
            </>
          )}

          {igErros.length > 0 && (
            <>
              <div className="block-title">🚨 Erros amadores detectados</div>
              <div className="finding finding-prob" style={{ marginBottom: 20 }}>
                <ul>{igErros.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
              </div>
            </>
          )}

          {igVeredicto && (
            <div className="verdict">
              <div className="verdict-eyebrow">💬 VEREDICTO · ANÁLISE FINAL</div>
              <p className="verdict-text">{igVeredicto}</p>
              <div className="verdict-sig">— Diagnóstico de Posicionamento</div>
            </div>
          )}
        </section>
      )}

      {/* ============ PÁGINA 6 — PLANO DE AÇÃO ============ */}
      {oportunidades.length > 0 && (
        <section className="page">
          <div className="head">
            <div className="head-section">🚀 Plano de Ação</div>
            <div className="head-lead">{headLead}</div>
            <div className="head-page">06</div>
          </div>

          <div className="section-eyebrow">Onde a IA resolve</div>
          <h2 className="section-title">{oportunidades.length} oportunidades concretas pra atacar</h2>
          <p className="section-intro">Cada oportunidade foi mapeada a partir dos achados específicos da auditoria — não é solução genérica.</p>

          {oportunidades.map((op, i) => {
            const pri = (op.prioridade || "alta").toLowerCase();
            return (
              <div key={i} className="op-card">
                <div className="op-header">
                  <div className="op-num">{String(i + 1).padStart(2, "0")}</div>
                  <div className="op-titulo">{op.titulo}</div>
                  <span className={`op-priority pri-${pri}`}>{pri}</span>
                </div>
                {op.descricao && <p className="op-desc">{op.descricao}</p>}
                <div className="op-foot">
                  {op.impacto_estimado && (
                    <div className="op-foot-block">
                      <div className="op-foot-label">📈 Impacto estimado</div>
                      <div className="op-foot-value">{op.impacto_estimado}</div>
                    </div>
                  )}
                  {(op.solucao || op.produto_sugerido) && (
                    <div className="op-foot-block">
                      <div className="op-foot-label">🤖 Solução IA</div>
                      <div className="op-foot-value">{op.solucao || op.produto_sugerido}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ============ PÁGINA 7 — PRÓXIMOS PASSOS ============ */}
      <section className="page page-dark">
        <div className="head">
          <div className="head-section">Próximos Passos</div>
          <div className="head-lead">{headLead}</div>
          <div className="head-page">07</div>
        </div>

        <div className="final-content">
          <div className="final-tag">PRÓXIMOS PASSOS</div>
          <h2 className="final-title">Pronto pra transformar esses achados em receita?</h2>
          <p className="final-text">
            Identificamos <strong>{(igProblemas.length + siteProblemas.length + adsProblemas.length)} problemas críticos</strong> e <strong>{oportunidades.length} oportunidades concretas</strong> onde IA resolve dores reais.
          </p>
          <p className="final-text">Todas as soluções recomendadas usam IAs já em produção, validadas por clientes, com implementação rápida e ROI mensurável.</p>

          <div className="final-cta">
            <div className="final-cta-line"><span>📅</span> Conversa de 30min pra detalhar o plano?</div>
            <div className="final-cta-line"><span>📧</span> seu-email@empresa.com</div>
            <div className="final-cta-line"><span>🌐</span> seu-site.com.br</div>
          </div>

          <div className="final-foot">
            Diagnóstico gerado em {dataFmt} · {(diag.fontes_consultadas || []).length} canais analisados · v3
          </div>
        </div>
      </section>
    </>
  );
}

// ============================================================
// SUB-COMPONENTES
// ============================================================
function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="context-card">
      <div className="context-card-label">{label}</div>
      <div className="context-card-value">{value}</div>
    </div>
  );
}

function Kpi({ label, value, sub, warn, small }: { label: string; value: any; sub?: string; warn?: boolean; small?: boolean }) {
  return (
    <div className={`kpi ${warn ? "kpi-warn" : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={small ? { fontSize: 13 } : undefined}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function MixRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="mix-row">
      <div className="mix-label">{label}</div>
      <div className="mix-track"><div className="mix-fill" style={{ width: `${pct}%`, background: color }} /></div>
      <div className="mix-pct">{pct}%</div>
    </div>
  );
}

// ============================================================
// CSS — copiado do diagnostico-frank-v3.html (validado)
// ============================================================
const PRINT_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');

@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; padding: 0; background: #f0f0f3; font-family: 'Inter', -apple-system, sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

.page { width: 210mm; min-height: 297mm; margin: 14px auto; background: white; box-shadow: 0 6px 30px rgba(0,0,0,0.08); page-break-after: always; padding: 22mm 18mm; position: relative; }
.page-dark { background: #0a0a0c; color: #e5e5e7; }
.page:last-child { page-break-after: auto; }

@media print {
  body { background: white; }
  .page { margin: 0; box-shadow: none; }
  .print-tip { display: none; }
}

.print-tip { position: fixed; top: 16px; right: 16px; background: #c8952e; color: #0a0a0c; padding: 10px 18px; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; z-index: 9999; border: none; box-shadow: 0 6px 20px rgba(0,0,0,0.3); }

.head { display: flex; justify-content: space-between; align-items: center; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; padding-bottom: 14px; margin-bottom: 26px; border-bottom: 1px solid rgba(0,0,0,0.06); }
.head-section { font-weight: 700; color: #c8952e; }
.head-lead { font-weight: 500; color: #64748b; }
.head-page { font-weight: 600; color: #94a3b8; font-family: 'JetBrains Mono'; }
.page-dark .head { border-bottom-color: rgba(255,255,255,0.08); }
.page-dark .head-lead { color: #94a3b8; }
.page-dark .head-page { color: #475569; }

.cover-grid { display: grid; grid-template-rows: auto 1fr auto auto; height: 252mm; }
.cover-top { display: flex; justify-content: space-between; align-items: flex-start; }
.cover-logo { display: flex; align-items: center; gap: 10px; }
.cover-logo-mark { width: 36px; height: 36px; background: #c8952e; color: #0a0a0c; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; border-radius: 6px; letter-spacing: 0.5px; }
.cover-logo-text { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
.cover-meta-right { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #64748b; line-height: 1.7; text-align: right; font-family: 'JetBrains Mono'; }

.cover-hero { display: flex; flex-direction: column; justify-content: center; padding: 0 0 20mm; }
.cover-tag { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; padding: 6px 14px; border: 1px solid rgba(200,149,46,0.4); background: rgba(200,149,46,0.08); border-radius: 999px; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; color: #c8952e; margin-bottom: 24px; }
.cover-tag-dot { width: 6px; height: 6px; background: #c8952e; border-radius: 50%; }
.cover-segment { font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase; color: #c8952e; margin-bottom: 8px; font-weight: 600; }
.cover-name { font-size: 64px; font-weight: 800; line-height: 1.02; letter-spacing: -2.5px; margin: 0 0 14px; color: #f8fafc; }
.cover-positioning { font-size: 17px; line-height: 1.5; color: #94a3b8; max-width: 560px; margin: 0 0 18px; font-weight: 400; }
.cover-meta-line { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: #64748b; font-family: 'JetBrains Mono'; }
.cover-meta-line span { display: inline-flex; align-items: center; gap: 5px; }

.cover-score-row { display: grid; grid-template-columns: 220px 1fr; gap: 32px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06); align-items: center; }
.cover-score-big { display: flex; flex-direction: column; gap: 4px; }
.cover-score-tier { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }
.tier-alta { color: #f87171; }
.tier-media { color: #fbbf24; }
.tier-baixa { color: #4ade80; }
.cover-score-num { font-size: 84px; font-weight: 800; line-height: 1; letter-spacing: -3px; }
.cover-score-num span { font-size: 26px; color: #475569; font-weight: 500; letter-spacing: 0; }

.cover-pillars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.cover-pillar { padding: 12px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; }
.cover-pillar-label { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #64748b; font-weight: 700; }
.cover-pillar-score { font-size: 26px; font-weight: 800; margin-top: 4px; letter-spacing: -1px; }
.cover-pillar.tier-alta .cover-pillar-score { color: #f87171; }
.cover-pillar.tier-media .cover-pillar-score { color: #fbbf24; }
.cover-pillar.tier-baixa .cover-pillar-score { color: #4ade80; }
.cover-pillar.tier-na .cover-pillar-score { color: #475569; }

.cover-foot { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 16px; font-size: 10px; color: #64748b; letter-spacing: 1px; }
.cover-foot-page { font-size: 28px; font-weight: 800; color: #c8952e; letter-spacing: -1px; font-family: 'JetBrains Mono'; }

.section-eyebrow { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #c8952e; font-weight: 700; margin-bottom: 6px; }
.section-title { font-size: 32px; font-weight: 800; line-height: 1.05; letter-spacing: -1px; margin: 0 0 10px; color: #0f172a; }
.section-intro { font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 22px; max-width: 600px; }
.block-title { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; color: #475569; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }

.context-summary { background: linear-gradient(135deg, #fef9ef 0%, #faf3df 100%); border: 1px solid #f5e3b3; border-radius: 14px; padding: 22px 26px; margin-bottom: 18px; }
.context-summary-eyebrow { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; color: #c8952e; margin-bottom: 8px; }
.context-summary-text { font-size: 16px; line-height: 1.5; color: #1e293b; font-weight: 500; margin: 0; }

.context-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
.context-card { padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
.context-card-label { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #64748b; font-weight: 700; }
.context-card-value { font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 4px; }

.context-block { padding: 16px 20px; border-radius: 12px; background: white; border-left: 3px solid #c8952e; margin-bottom: 12px; }
.context-block-text { font-size: 13px; line-height: 1.6; color: #1e293b; margin: 0; }
.context-list { margin: 0; padding-left: 22px; font-size: 12px; line-height: 1.7; color: #1e293b; }

.context-pain { background: #fef2f2; border-left-color: #dc2626; }

.tag-cloud { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-pill { padding: 4px 10px; background: #f1f5f9; color: #334155; border-radius: 999px; font-size: 11px; font-weight: 500; font-family: 'JetBrains Mono'; }

.competitors { display: flex; flex-wrap: wrap; gap: 4px; }
.competitor { padding: 3px 8px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 6px; font-size: 11px; font-weight: 500; font-family: 'JetBrains Mono'; }

.ig-hero { display: grid; grid-template-columns: 88px 1fr auto; gap: 16px; align-items: center; padding: 18px 20px; background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); border: 1px solid #fbcfe8; border-radius: 16px; margin-bottom: 16px; }
.ig-avatar { width: 88px; height: 88px; border-radius: 50%; overflow: hidden; border: 3px solid white; box-shadow: 0 4px 14px rgba(236,72,153,0.3); background: #fff; }
.ig-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ig-info { min-width: 0; }
.ig-handle-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.ig-handle { font-size: 18px; font-weight: 800; color: #831843; }
.ig-badge { font-size: 9px; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.5px; font-weight: 700; }
.ig-badge-verified { background: #3b82f6; color: white; }
.ig-badge-biz { background: #ec4899; color: white; }
.ig-fullname { font-size: 14px; font-weight: 600; color: #0f172a; margin: 0 0 6px; }
.ig-bio { font-size: 12px; color: #475569; line-height: 1.5; margin: 0; font-style: italic; }
.ig-biolink { font-size: 11px; color: #64748b; margin: 4px 0 0; font-family: 'JetBrains Mono'; }
.ig-biolink strong { color: #ec4899; }
.ig-score { padding: 12px 18px; border-radius: 12px; text-align: center; }
.score-bg-alta { background: #fee2e2; }
.score-bg-media { background: #fef3c7; }
.score-bg-baixa { background: #d1fae5; }
.score-bg-na { background: #f1f5f9; }
.ig-score-num { font-size: 32px; font-weight: 800; line-height: 1; }
.score-bg-alta .ig-score-num { color: #dc2626; }
.score-bg-media .ig-score-num { color: #b45309; }
.score-bg-baixa .ig-score-num { color: #047857; }
.score-bg-na .ig-score-num { color: #475569; }
.ig-score-of { font-size: 11px; color: #64748b; font-weight: 600; }

.kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 16px; }
.kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
.kpi-warn { background: #fef2f2; border-color: #fecaca; }
.kpi-label { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #64748b; font-weight: 700; }
.kpi-value { font-size: 22px; font-weight: 800; line-height: 1.1; margin-top: 4px; color: #0f172a; letter-spacing: -0.5px; }
.kpi-warn .kpi-value { color: #dc2626; }
.kpi-sub { font-size: 9px; color: #94a3b8; margin-top: 2px; font-family: 'JetBrains Mono'; }

.mix-block { padding: 14px 16px; background: #f8fafc; border-radius: 10px; margin-bottom: 16px; }
.mix-title { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; color: #475569; margin-bottom: 10px; }
.mix-row { display: grid; grid-template-columns: 110px 1fr 50px; gap: 10px; align-items: center; margin-bottom: 6px; }
.mix-label { font-size: 12px; font-weight: 600; color: #1e293b; }
.mix-track { height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; }
.mix-fill { height: 100%; border-radius: 5px; }
.mix-pct { font-size: 13px; font-weight: 800; color: #0f172a; text-align: right; }

.posts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
.post-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
.post-thumb { width: 100%; height: 110px; border-radius: 6px; overflow: hidden; margin-bottom: 8px; background: #f1f5f9; }
.post-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.post-header { display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-bottom: 6px; font-family: 'JetBrains Mono'; }
.post-tipo { font-weight: 700; }
.post-tipo.reel { color: #dc2626; }
.post-tipo.carousel { color: #b45309; }
.post-tipo.image { color: #047857; }
.post-caption { font-size: 11px; line-height: 1.45; color: #334155; margin: 0 0 8px; max-height: 50px; overflow: hidden; }
.post-stats { display: flex; gap: 12px; font-size: 11px; color: #64748b; font-weight: 600; }

.hashtags-block { padding: 12px 16px; background: #f8fafc; border-radius: 10px; margin-bottom: 16px; }

.findings { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
.finding { padding: 12px 14px; border-radius: 10px; border: 1px solid; }
.finding-prob { background: #fef2f2; border-color: #fecaca; }
.finding-att { background: #fefce8; border-color: #fde68a; }
.finding-pos { background: #f0fdf4; border-color: #bbf7d0; }
.finding-title { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; }
.finding-prob .finding-title { color: #b91c1c; }
.finding-att .finding-title { color: #a16207; }
.finding-pos .finding-title { color: #15803d; }
.finding ul { margin: 0; padding-left: 18px; font-size: 11px; line-height: 1.5; color: #1e293b; }
.finding li { margin-bottom: 4px; }
.sev-tag { display: inline-block; padding: 1px 5px; background: #dc2626; color: white; font-size: 8px; font-weight: 700; border-radius: 3px; margin-right: 6px; vertical-align: middle; letter-spacing: 0.5px; }

.ai-block { background: linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%); border: 1px solid #c7d2fe; border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; }
.ai-title { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; color: #4338ca; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.ai-row { font-size: 12px; line-height: 1.6; color: #1e293b; margin-bottom: 8px; }
.ai-row strong { color: #4338ca; font-weight: 700; }
.ai-list { margin: 4px 0 0; padding-left: 22px; font-size: 11px; line-height: 1.6; color: #334155; }
.ai-list li { margin-bottom: 3px; }
.ai-list-warn li { color: #b45309; }
.ai-list-good li { color: #047857; }

.ads-section { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; }
.ads-title { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; color: #1d4ed8; margin-bottom: 10px; }
.ad-card { background: white; border: 1px solid #dbeafe; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; }
.ad-header { display: flex; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.ad-tag { font-size: 9px; padding: 2px 7px; background: #f1f5f9; border-radius: 4px; font-weight: 600; color: #475569; letter-spacing: 0.5px; font-family: 'JetBrains Mono'; }
.ad-tag-active { background: #dcfce7; color: #166534; }
.ad-tag-cta { background: #fef3c7; color: #92400e; }
.ad-body { font-size: 11px; line-height: 1.55; color: #1e293b; margin: 0; font-style: italic; padding: 8px 10px; background: #f8fafc; border-left: 3px solid #3b82f6; border-radius: 4px; }

.pilar-banner { display: flex; align-items: center; gap: 16px; padding: 18px 22px; background: #0a0a0c; color: white; border-radius: 14px; margin-bottom: 22px; }
.pilar-banner-emoji { font-size: 38px; }
.pilar-banner-info { flex: 1; }
.pilar-banner-eyebrow { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #c8952e; font-weight: 700; }
.pilar-banner-title { font-size: 28px; font-weight: 800; margin: 2px 0 4px; letter-spacing: -1px; }
.pilar-banner-desc { font-size: 12px; color: #94a3b8; }
.pilar-banner-score { padding: 14px 22px; background: rgba(255,255,255,0.06); border-radius: 12px; text-align: center; }
.pilar-banner-score-num { font-size: 32px; font-weight: 800; line-height: 1; }
.pilar-banner-score.tier-alta .pilar-banner-score-num { color: #f87171; }
.pilar-banner-score.tier-media .pilar-banner-score-num { color: #fbbf24; }
.pilar-banner-score.tier-baixa .pilar-banner-score-num { color: #4ade80; }
.pilar-banner-score.tier-na .pilar-banner-score-num { color: #94a3b8; }
.pilar-banner-score-of { font-size: 11px; color: #64748b; }

.op-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px 22px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.op-header { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
.op-num { font-size: 32px; font-weight: 900; color: #c8952e; line-height: 1; min-width: 40px; letter-spacing: -1px; }
.op-titulo { flex: 1; font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.3; }
.op-priority { font-size: 9px; padding: 4px 10px; border-radius: 999px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.pri-alta { background: #fee2e2; color: #b91c1c; }
.pri-media { background: #fef3c7; color: #92400e; }
.op-desc { font-size: 12px; line-height: 1.6; color: #334155; margin: 0 0 14px; }
.op-foot { display: flex; gap: 24px; padding-top: 12px; border-top: 1px dashed #e2e8f0; }
.op-foot-block { flex: 1; }
.op-foot-label { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; font-weight: 700; }
.op-foot-value { font-size: 12px; font-weight: 600; color: #0f172a; margin-top: 3px; }

.final-content { display: flex; flex-direction: column; justify-content: center; height: 250mm; }
.final-tag { display: inline-flex; align-self: flex-start; padding: 8px 16px; background: rgba(200,149,46,0.1); border: 1px solid rgba(200,149,46,0.4); color: #c8952e; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; border-radius: 999px; margin-bottom: 22px; }
.final-title { font-size: 48px; font-weight: 800; line-height: 1.05; letter-spacing: -2px; color: #f8fafc; margin: 0 0 22px; max-width: 540px; }
.final-text { font-size: 14px; line-height: 1.7; color: #94a3b8; margin: 0 0 14px; max-width: 480px; }
.final-text strong { color: #c8952e; font-weight: 600; }
.final-cta { margin-top: 28px; padding: 22px 26px; background: rgba(255,255,255,0.03); border: 1px solid rgba(200,149,46,0.2); border-radius: 14px; max-width: 480px; }
.final-cta-line { display: flex; align-items: center; gap: 14px; font-size: 14px; color: #f8fafc; margin: 8px 0; }
.final-cta-line span { font-size: 18px; }
.final-foot { margin-top: auto; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 10px; color: #475569; text-align: center; letter-spacing: 1px; }

.pilar-bar { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 10px; }
.pilar-bar-label { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 6px; }
.pilar-bar-track { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
.pilar-bar-fill { height: 100%; border-radius: 3px; }
.pilar-bar-num { font-size: 24px; font-weight: 800; line-height: 1; letter-spacing: -1px; }
.pilar-bar-obs { font-size: 9.5px; color: #475569; margin-top: 4px; line-height: 1.4; }

.bio-line { display: grid; grid-template-columns: 28px 1fr 1.4fr; gap: 12px; padding: 10px 14px; border-radius: 8px; align-items: center; }
.bio-ok { background: #f0fdf4; border-left: 3px solid #16a34a; }
.bio-warn { background: #fefce8; border-left: 3px solid #eab308; }
.bio-status { font-size: 18px; font-weight: 800; text-align: center; }
.bio-ok .bio-status { color: #16a34a; }
.bio-warn .bio-status { color: #b45309; }
.bio-content { font-size: 12px; color: #1e293b; }
.bio-content strong { color: #0f172a; }
.bio-obs { font-size: 11px; color: #64748b; font-style: italic; }

.content-type { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; border: 1px solid; }
.ct-ok { background: #f0fdf4; border-color: #bbf7d0; }
.ct-fail { background: #fef2f2; border-color: #fecaca; }
.ct-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; }
.ct-ok .ct-icon { background: #16a34a; color: white; }
.ct-fail .ct-icon { background: #dc2626; color: white; }
.content-type strong { font-size: 12px; color: #0f172a; }
.ct-obs { font-size: 10px; color: #64748b; margin-top: 2px; line-height: 1.4; }

.verdict { background: linear-gradient(135deg, #0a0a0c 0%, #1a1a20 100%); color: #f8fafc; border: 1px solid #334155; border-radius: 16px; padding: 26px 30px; margin-top: 18px; position: relative; overflow: hidden; }
.verdict-eyebrow { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; color: #c8952e; margin-bottom: 14px; position: relative; z-index: 1; }
.verdict-text { font-size: 14px; line-height: 1.65; color: #e5e5e7; margin: 0; font-weight: 400; position: relative; z-index: 1; }
.verdict-text strong { color: #c8952e; font-weight: 600; }
.verdict-text em { color: #fbbf24; font-style: italic; }
.verdict-sig { margin-top: 18px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; font-weight: 600; text-align: right; position: relative; z-index: 1; }
`;
