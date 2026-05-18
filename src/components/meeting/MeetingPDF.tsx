import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  pdf,
  Circle,
  Svg,
  Rect,
  Line,
  Path,
} from '@react-pdf/renderer';

interface MeetingPDFData {
  clientName: string;
  date: string;
  time: string;
  duration: string;
  responsavel: string;
  sentiment: 'positive' | 'negative' | 'neutral' | string;
  diagnostico: string;
  pontosChave: string[];
  proximosPassos: { titulo: string; descricao: string; prioridade: string; prazo?: string }[];
  riscos: string[];
  proximoPasso?: string;
}

// Paleta laranja IAP
const C = {
  orange: '#f97316',
  orangeLight: '#fdba74',
  orangeDark: '#c2410c',
  orangeBg: '#fff7ed',
  orangeBorder: '#fed7aa',
  bg: '#18181b',
  bgLight: '#27272a',
  white: '#ffffff',
  textWhite: '#fafafa',
  textMuted: '#a1a1aa',
  textDark: '#18181b',
  textBody: '#3f3f46',
  textLight: '#71717a',
  cardBg: '#ffffff',
  cardBorder: '#e4e4e7',
  pageBg: '#fafafa',
  green: '#16a34a',
  greenBg: '#f0fdf4',
  greenBorder: '#bbf7d0',
  red: '#dc2626',
  redBg: '#fef2f2',
  redBorder: '#fecaca',
  yellow: '#d97706',
  yellowBg: '#fffbeb',
  yellowBorder: '#fde68a',
  divider: '#e4e4e7',
};

const s = StyleSheet.create({
  page: { backgroundColor: C.pageBg, fontFamily: 'Helvetica', paddingBottom: 50 },

  // === HEADER ===
  header: { backgroundColor: C.bg, paddingHorizontal: 36, paddingTop: 28, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  logo: { width: 90, height: 40 },
  headerBadge: { backgroundColor: C.bgLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  headerBadgeText: { fontSize: 8, color: C.orangeLight, letterSpacing: 2, fontFamily: 'Helvetica-Bold' },
  headerDivider: { height: 1, backgroundColor: '#3f3f46', marginBottom: 14 },
  headerBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  clientName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.white, marginBottom: 5 },
  headerMeta: { fontSize: 9, color: C.textMuted, marginBottom: 2 },
  sentimentPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  sentimentPillText: { fontSize: 8, fontFamily: 'Helvetica-Bold' },

  // === ORANGE STRIP ===
  strip: { height: 3, backgroundColor: C.orange },

  // === BODY ===
  body: { paddingHorizontal: 36, paddingTop: 20 },

  // === SECTIONS ===
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.textDark, letterSpacing: 0.5 },

  // === CARD ===
  card: { backgroundColor: C.cardBg, borderRadius: 6, padding: 14, borderWidth: 1, borderColor: C.cardBorder },
  cardText: { fontSize: 9.5, color: C.textBody, lineHeight: 1.6 },

  // === BULLET LIST ===
  bulletRow: { flexDirection: 'row', marginBottom: 5, paddingRight: 8 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.orange, marginTop: 4, marginRight: 8 },
  bulletText: { fontSize: 9.5, color: C.textBody, lineHeight: 1.55, flex: 1 },

  // === TASK CARDS ===
  taskCard: {
    backgroundColor: C.cardBg, borderRadius: 6, padding: 10, borderWidth: 1, borderColor: C.cardBorder,
    marginBottom: 5, flexDirection: 'row', alignItems: 'flex-start',
  },
  taskNum: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: C.orange,
    justifyContent: 'center', alignItems: 'center', marginRight: 10, marginTop: 1,
  },
  taskNumText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.textDark, marginBottom: 2 },
  taskDesc: { fontSize: 8, color: C.textLight, lineHeight: 1.5, marginBottom: 4 },
  taskMetaRow: { flexDirection: 'row' },
  badge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, marginRight: 5 },
  badgeText: { fontSize: 7, fontFamily: 'Helvetica-Bold' },

  // === RISK CARD ===
  riskCard: { backgroundColor: C.redBg, borderRadius: 6, padding: 14, borderWidth: 1, borderColor: C.redBorder },
  riskRow: { flexDirection: 'row', marginBottom: 4, paddingRight: 8 },
  riskDotView: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.red, marginTop: 4, marginRight: 8 },
  riskText: { fontSize: 9, color: '#991b1b', lineHeight: 1.5, flex: 1 },

  // === FOOTER ===
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 36, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.divider,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.pageBg,
  },
  footerText: { fontSize: 7, color: C.textLight },
  footerBrand: { fontSize: 7, color: C.orange, fontFamily: 'Helvetica-Bold' },
});

function sentimentLabel(v: string) {
  if (v === 'positive' || v === 'positivo') return 'Positivo';
  if (v === 'negative' || v === 'negativo') return 'Negativo';
  return 'Neutro';
}
function sentimentColors(v: string) {
  if (v === 'positive' || v === 'positivo') return { bg: C.greenBg, text: C.green, border: C.greenBorder };
  if (v === 'negative' || v === 'negativo') return { bg: C.redBg, text: C.red, border: C.redBorder };
  return { bg: C.yellowBg, text: C.yellow, border: C.yellowBorder };
}
function priorityStyle(p: string) {
  if (p === 'high') return { bg: C.redBg, text: C.red, label: 'Alta' };
  if (p === 'medium') return { bg: C.yellowBg, text: C.yellow, label: 'Media' };
  return { bg: C.greenBg, text: C.green, label: 'Baixa' };
}
function prazoLabel(p?: string) {
  if (!p) return '';
  const m: Record<string, string> = { hoje: 'Hoje', amanha: 'Amanha', esta_semana: 'Esta semana', proxima_semana: 'Proxima semana' };
  return m[p] || p;
}

const MeetingPDFDocument = ({ data, logoBase64 }: { data: MeetingPDFData; logoBase64: string }) => {
  const sc = sentimentColors(data.sentiment);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* === HEADER === */}
        <View style={s.header}>
          <View style={s.headerRow}>
            {logoBase64 ? (
              <Image src={logoBase64} style={s.logo} />
            ) : (
              <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.orange }}>CRM</Text>
            )}
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeText}>RESUMO DE REUNIAO</Text>
            </View>
          </View>
          <View style={s.headerDivider} />
          <View style={s.headerBottom}>
            <View style={{ flex: 1 }}>
              <Text style={s.clientName}>{data.clientName}</Text>
              <Text style={s.headerMeta}>{data.date}  |  {data.time}  |  {data.duration}</Text>
              <Text style={s.headerMeta}>Responsavel: {data.responsavel}</Text>
            </View>
            <View style={[s.sentimentPill, { backgroundColor: sc.bg, borderWidth: 1, borderColor: sc.border }]}>
              <Text style={[s.sentimentPillText, { color: sc.text }]}>{sentimentLabel(data.sentiment)}</Text>
            </View>
          </View>
        </View>

        {/* Orange strip */}
        <View style={s.strip} />

        {/* === BODY === */}
        <View style={s.body}>
          {/* Diagnostico */}
          {data.diagnostico ? (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: C.orange }]} />
                <Text style={s.sectionTitle}>DIAGNOSTICO</Text>
              </View>
              <View style={s.card}>
                <Text style={s.cardText}>{data.diagnostico}</Text>
              </View>
            </View>
          ) : null}

          {/* Pontos-Chave */}
          {data.pontosChave.length > 0 ? (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: '#3b82f6' }]} />
                <Text style={s.sectionTitle}>PONTOS-CHAVE</Text>
              </View>
              <View style={s.card}>
                {data.pontosChave.map((pt, i) => (
                  <View key={i} style={s.bulletRow}>
                    <View style={s.bulletDot} />
                    <Text style={s.bulletText}>{pt}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Proximos Passos */}
          {data.proximosPassos.length > 0 ? (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: C.green }]} />
                <Text style={s.sectionTitle}>PROXIMOS PASSOS</Text>
              </View>
              {data.proximosPassos.map((task, i) => {
                const ps = priorityStyle(task.prioridade);
                return (
                  <View key={i} style={s.taskCard}>
                    <View style={s.taskNum}>
                      <Text style={s.taskNumText}>{i + 1}</Text>
                    </View>
                    <View style={s.taskBody}>
                      <Text style={s.taskTitle}>{task.titulo}</Text>
                      {task.descricao && task.descricao !== task.titulo ? (
                        <Text style={s.taskDesc}>{task.descricao}</Text>
                      ) : null}
                      <View style={s.taskMetaRow}>
                        <View style={[s.badge, { backgroundColor: ps.bg }]}>
                          <Text style={[s.badgeText, { color: ps.text }]}>{ps.label}</Text>
                        </View>
                        {task.prazo ? (
                          <View style={[s.badge, { backgroundColor: '#f4f4f5' }]}>
                            <Text style={[s.badgeText, { color: C.textLight }]}>{prazoLabel(task.prazo)}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Riscos */}
          {data.riscos.length > 0 ? (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: C.red }]} />
                <Text style={s.sectionTitle}>PONTOS DE ATENCAO</Text>
              </View>
              <View style={s.riskCard}>
                {data.riscos.map((risk, i) => (
                  <View key={i} style={s.riskRow}>
                    <View style={s.riskDotView} />
                    <Text style={s.riskText}>{risk}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* === FOOTER === */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Documento gerado automaticamente por IA</Text>
          <Text style={s.footerBrand}>MINHA EMPRESA</Text>
        </View>
      </Page>
    </Document>
  );
};

async function loadLogoAsBase64(): Promise<string> {
  try {
    const response = await fetch('/logo-iap-white.png');
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

export async function generateMeetingPDF(data: MeetingPDFData): Promise<Blob> {
  const logoBase64 = await loadLogoAsBase64();
  const blob = await pdf(<MeetingPDFDocument data={data} logoBase64={logoBase64} />).toBlob();
  return blob;
}

export function downloadMeetingPDF(blob: Blob, clientName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = clientName.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '-');
  const date = new Date().toISOString().split('T')[0];
  link.download = `Resumo-Reuniao-${safeName}-${date}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export type { MeetingPDFData };
