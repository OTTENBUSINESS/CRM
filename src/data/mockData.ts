import type { User, Lead, Client, Transaction, Campaign, Task, Alert } from '@/types';

// ==================== USERS & PERMISSIONS ====================
export const mockUsers: User[] = [
  {
    id: '1',
    name: 'Admin User',
    email: 'frank@empresa.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Frank',
    role: 'admin',
    modules: ['cockpit', 'gestao', 'growth', 'comercial', 'clientes', 'financeiro', 'operacoes', 'cs', 'suporte', 'time'],
    defaultModule: 'cockpit',
  },
  {
    id: '2',
    name: 'Carlos Vendedor',
    email: 'carlos@empresa.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos',
    role: 'vendedor',
    modules: ['comercial'],
    defaultModule: 'comercial',
  },
  {
    id: '3',
    name: 'Ana CS',
    email: 'ana@empresa.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ana',
    role: 'cs',
    modules: ['clientes', 'cs'],
    defaultModule: 'cs',
  },
  {
    id: '4',
    name: 'Pedro Marketing',
    email: 'pedro@empresa.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Pedro',
    role: 'marketing',
    modules: ['growth', 'cockpit'],
    defaultModule: 'growth',
  },
  {
    id: '5',
    name: 'Julia Financeiro',
    email: 'julia@empresa.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Julia',
    role: 'financeiro',
    modules: ['financeiro', 'cockpit'],
    defaultModule: 'financeiro',
  },
  {
    id: '6',
    name: 'Lucas Suporte',
    email: 'lucas@empresa.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lucas',
    role: 'suporte',
    modules: ['suporte'],
    defaultModule: 'suporte',
  },
];

export const currentUser = mockUsers[0]; // Frank - Admin com acesso total

// ==================== LEADS ====================
export const mockLeads: Lead[] = [
  {
    id: 'lead-1',
    name: 'Admin User',
    email: 'frank@empresa.com',
    phone: '(11) 99999-1234',
    company: 'Minha Empresa',
    role: 'CEO',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Frank',
    status: 'negociacao',
    score: 85,
    product: 'pain',
    utmSource: 'Instagram Ads',
    utmCampaign: 'Reels F1 - PAIN',
    qualificationChecklist: {
      budget: true,
      decisionMaker: true,
      painIdentified: true,
      timeline: false,
    },
    interactions: [
      { id: '1', type: 'click', title: 'Clicou no anuncio', description: 'Instagram Reels - PAIN', createdAt: '2024-01-10T10:30:00Z' },
      { id: '2', type: 'form', title: 'Preencheu formulario', description: 'Landing page PAIN', createdAt: '2024-01-10T10:35:00Z' },
      { id: '3', type: 'whatsapp', title: 'Bot iniciou conversa', description: 'Respondeu interesse alto', createdAt: '2024-01-10T10:40:00Z' },
      { id: '4', type: 'call', title: 'Ligacao comercial', description: 'Qualificado - proxima etapa reuniao', createdAt: '2024-01-11T14:00:00Z' },
    ],
    createdAt: '2024-01-10T10:30:00Z',
    updatedAt: '2024-01-11T14:00:00Z',
  },
  {
    id: 'lead-2',
    name: 'Marina Costa',
    email: 'marina@techcorp.com',
    phone: '(21) 98888-5678',
    company: 'TechCorp',
    role: 'Diretora de Inovacao',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marina',
    status: 'qualificacao',
    score: 65,
    product: 'saas',
    utmSource: 'Google Ads',
    utmCampaign: 'Search - SaaS Demo',
    qualificationChecklist: {
      budget: true,
      decisionMaker: false,
      painIdentified: true,
      timeline: false,
    },
    interactions: [
      { id: '1', type: 'click', title: 'Clicou no anuncio', description: 'Google Search', createdAt: '2024-01-12T09:00:00Z' },
      { id: '2', type: 'form', title: 'Solicitou demo', description: 'Pagina de SaaS', createdAt: '2024-01-12T09:10:00Z' },
    ],
    createdAt: '2024-01-12T09:00:00Z',
    updatedAt: '2024-01-12T09:10:00Z',
  },
  {
    id: 'lead-3',
    name: 'Roberto Almeida',
    email: 'roberto@startup.io',
    phone: '(11) 97777-4321',
    company: 'Startup.io',
    role: 'Founder',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Roberto',
    status: 'agendamento',
    score: 78,
    product: 'imersao',
    utmSource: 'LinkedIn Ads',
    utmCampaign: 'Imersao IA - Founders',
    qualificationChecklist: {
      budget: true,
      decisionMaker: true,
      painIdentified: false,
      timeline: true,
    },
    interactions: [
      { id: '1', type: 'click', title: 'Clicou no anuncio', description: 'LinkedIn', createdAt: '2024-01-13T16:00:00Z' },
      { id: '2', type: 'form', title: 'Inscreveu na Imersao', description: 'Formulario completo', createdAt: '2024-01-13T16:15:00Z' },
    ],
    createdAt: '2024-01-13T16:00:00Z',
    updatedAt: '2024-01-13T16:15:00Z',
  },
  {
    id: 'lead-4',
    name: 'Camila Santos',
    email: 'camila@bigco.com.br',
    phone: '(31) 96666-9876',
    company: 'BigCo Brasil',
    role: 'Head de Tecnologia',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Camila',
    status: 'captura',
    score: 35,
    product: 'servicos',
    utmSource: 'Organico',
    utmCampaign: 'Blog - SEO',
    qualificationChecklist: {
      budget: false,
      decisionMaker: false,
      painIdentified: false,
      timeline: false,
    },
    interactions: [
      { id: '1', type: 'click', title: 'Visitou blog', description: 'Artigo sobre IA', createdAt: '2024-01-14T11:00:00Z' },
    ],
    createdAt: '2024-01-14T11:00:00Z',
    updatedAt: '2024-01-14T11:00:00Z',
  },
];

// ==================== CLIENTS ====================
export const mockClients: Client[] = [
  {
    id: 'client-1',
    name: 'Admin User',
    email: 'frank@empresa.com',
    phone: '(11) 99999-1234',
    company: 'Minha Empresa',
    role: 'CEO',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Frank',
    healthScore: 65,
    healthReason: 'Baixo engajamento no grupo do WhatsApp',
    ltv: 12500,
    paymentStatus: 'ativo',
    products: [
      { type: 'imersao', status: 'concluido', startDate: '2023-06-01', endDate: '2023-06-03' },
      { type: 'saas', status: 'ativo', startDate: '2023-07-01', lastActivity: '2 horas atras' },
    ],
    badges: [
      { type: 'high-ltv', label: 'High LTV' },
      { type: 'churn-risk', label: 'Risco de Churn' },
    ],
    alerts: [
      { id: '1', severity: 'danger', title: 'Pagamento Falhou', description: 'Pagamento do SaaS falhou esta manha', createdAt: '2024-01-15T08:00:00Z' },
      { id: '2', severity: 'warning', title: 'Baixo Engajamento', description: 'Nao participou das ultimas 3 calls', createdAt: '2024-01-14T10:00:00Z' },
    ],
    interactions: [
      { id: '1', type: 'login', title: 'Login na plataforma', description: 'Acesso via web', createdAt: '2024-01-15T07:30:00Z' },
      { id: '2', type: 'meeting', title: 'Call de acompanhamento', description: 'Com Ana (CS)', createdAt: '2024-01-10T15:00:00Z' },
    ],
    createdAt: '2023-06-01T10:00:00Z',
    updatedAt: '2024-01-15T08:00:00Z',
  },
  {
    id: 'client-2',
    name: 'Luciana Ferreira',
    email: 'luciana@innovate.com',
    phone: '(21) 98765-4321',
    company: 'Innovate Labs',
    role: 'COO',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Luciana',
    healthScore: 92,
    healthReason: 'Engajamento excelente em todas as atividades',
    ltv: 45000,
    paymentStatus: 'ativo',
    products: [
      { type: 'pain', status: 'ativo', startDate: '2023-09-01', nextAction: 'Call amanha as 10h' },
      { type: 'saas', status: 'ativo', startDate: '2023-09-15', lastActivity: '1 hora atras' },
      { type: 'servicos', status: 'ativo', startDate: '2023-11-01', nextAction: 'Entrega fase 2' },
    ],
    badges: [
      { type: 'vip', label: 'VIP' },
      { type: 'whale', label: 'Whale' },
      { type: 'high-ltv', label: 'High LTV' },
    ],
    alerts: [
      { id: '1', severity: 'success', title: 'Oportunidade de Upsell', description: 'Completou todos os modulos do PAIN', createdAt: '2024-01-14T16:00:00Z' },
    ],
    interactions: [
      { id: '1', type: 'login', title: 'Login na plataforma', description: 'Acesso via app', createdAt: '2024-01-15T09:00:00Z' },
      { id: '2', type: 'meeting', title: 'Mentoria PAIN', description: 'Sessao 8/12', createdAt: '2024-01-14T14:00:00Z' },
    ],
    createdAt: '2023-09-01T10:00:00Z',
    updatedAt: '2024-01-15T09:00:00Z',
  },
  {
    id: 'client-3',
    name: 'Andre Oliveira',
    email: 'andre@digitalco.com',
    phone: '(11) 91234-5678',
    company: 'DigitalCo',
    role: 'Diretor de Produto',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Andre',
    healthScore: 45,
    healthReason: 'Nao fez login ha 10 dias',
    ltv: 8500,
    paymentStatus: 'atrasado',
    products: [
      { type: 'saas', status: 'ativo', startDate: '2023-10-01', lastActivity: '10 dias atras' },
    ],
    badges: [
      { type: 'churn-risk', label: 'Risco de Churn' },
    ],
    alerts: [
      { id: '1', severity: 'danger', title: 'Risco de Churn', description: 'Usuario nao logou ha 10 dias', createdAt: '2024-01-15T06:00:00Z' },
      { id: '2', severity: 'danger', title: 'Pagamento Atrasado', description: 'Fatura vencida ha 5 dias', createdAt: '2024-01-10T08:00:00Z' },
    ],
    interactions: [
      { id: '1', type: 'email', title: 'Email de cobranca', description: 'Enviado automaticamente', createdAt: '2024-01-12T10:00:00Z' },
    ],
    createdAt: '2023-10-01T10:00:00Z',
    updatedAt: '2024-01-05T15:00:00Z',
  },
];

// ==================== TRANSACTIONS ====================
export const mockTransactions: Transaction[] = [
  { id: 'tx-1', clientId: 'client-1', clientName: 'Admin User', type: 'receita', category: 'SaaS', description: 'Mensalidade SaaS', amount: 997, status: 'pendente', dueDate: '2024-01-15' },
  { id: 'tx-2', clientId: 'client-2', clientName: 'Luciana Ferreira', type: 'receita', category: 'PAIN', description: 'Parcela 3/12 PAIN', amount: 2500, status: 'pago', dueDate: '2024-01-10', paidAt: '2024-01-10' },
  { id: 'tx-3', clientId: 'client-2', clientName: 'Luciana Ferreira', type: 'receita', category: 'SaaS', description: 'Mensalidade SaaS', amount: 997, status: 'pago', dueDate: '2024-01-05', paidAt: '2024-01-05' },
  { id: 'tx-4', clientId: 'client-3', clientName: 'Andre Oliveira', type: 'receita', category: 'SaaS', description: 'Mensalidade SaaS', amount: 997, status: 'atrasado', dueDate: '2024-01-10' },
  { id: 'tx-5', clientId: '', clientName: '', type: 'despesa', category: 'Marketing', description: 'Meta Ads - Janeiro', amount: 15000, status: 'pago', dueDate: '2024-01-01', paidAt: '2024-01-01' },
  { id: 'tx-6', clientId: '', clientName: '', type: 'despesa', category: 'Infraestrutura', description: 'Servidores AWS', amount: 3500, status: 'pago', dueDate: '2024-01-05', paidAt: '2024-01-05' },
  { id: 'tx-7', clientId: 'client-2', clientName: 'Luciana Ferreira', type: 'receita', category: 'Servicos', description: 'Implementacao Fase 1', amount: 25000, status: 'pago', dueDate: '2024-01-08', paidAt: '2024-01-08' },
];

// ==================== CAMPAIGNS ====================
export const mockCampaigns: Campaign[] = [
  { id: 'camp-1', name: 'Reels F1 - PAIN', platform: 'meta', status: 'ativo', budget: 10000, spent: 7500, impressions: 250000, clicks: 5000, leads: 127, conversions: 8 },
  { id: 'camp-2', name: 'Search - SaaS Demo', platform: 'google', status: 'ativo', budget: 5000, spent: 3200, impressions: 45000, clicks: 2100, leads: 45, conversions: 5 },
  { id: 'camp-3', name: 'Imersao IA - Founders', platform: 'linkedin', status: 'ativo', budget: 8000, spent: 6100, impressions: 120000, clicks: 1800, leads: 32, conversions: 12 },
  { id: 'camp-4', name: 'Remarketing - Carrinho', platform: 'meta', status: 'pausado', budget: 3000, spent: 2800, impressions: 85000, clicks: 1200, leads: 18, conversions: 3 },
];

// ==================== TASKS ====================
export const mockTasks: Task[] = [
  { id: 'task-1', title: 'Preparar material da Imersao', description: 'Slides e exercicios para proxima turma', assignee: 'Admin User', status: 'doing', priority: 'high', dueDate: '2024-01-20' },
  { id: 'task-2', title: 'Revisar contrato BigCo', description: 'Validar clausulas do novo contrato', assignee: 'Julia Financeiro', status: 'todo', priority: 'high', dueDate: '2024-01-18' },
  { id: 'task-3', title: 'Onboarding novo cliente', description: 'Setup inicial para Luciana', assignee: 'Ana CS', status: 'done', priority: 'medium', dueDate: '2024-01-12' },
  { id: 'task-4', title: 'Otimizar campanhas Meta', description: 'Ajustar publicos e criativos', assignee: 'Pedro Marketing', status: 'doing', priority: 'medium', dueDate: '2024-01-16' },
  { id: 'task-5', title: 'Follow-up leads quentes', description: 'Ligar para leads score > 80', assignee: 'Carlos Vendedor', status: 'todo', priority: 'high', dueDate: '2024-01-15' },
];

// ==================== DASHBOARD DATA ====================
export const dashboardKPIs = {
  revenueToday: { value: 45230, change: 12, label: 'Receita Hoje' },
  activeLeads: { value: 127, change: 8, label: 'Leads Ativos' },
  churnRisk: { value: 8, change: -2, label: 'Risco de Churn' },
  cac: { value: 342, change: -5, label: 'CAC Medio' },
};

export const chartLeadsVsSales = [
  { date: '01/Jan', leads: 45, vendas: 5 },
  { date: '05/Jan', leads: 52, vendas: 7 },
  { date: '10/Jan', leads: 78, vendas: 8 },
  { date: '15/Jan', leads: 95, vendas: 12 },
  { date: '20/Jan', leads: 110, vendas: 15 },
  { date: '25/Jan', leads: 127, vendas: 18 },
  { date: '30/Jan', leads: 145, vendas: 22 },
];

export const chartRevenueByProduct = [
  { product: 'PAIN', receita: 85000, meta: 100000 },
  { product: 'Imersao', receita: 45000, meta: 50000 },
  { product: 'SaaS', receita: 32000, meta: 40000 },
  { product: 'Servicos', receita: 65000, meta: 60000 },
];

export const urgentAlerts: Alert[] = [
  { id: '1', severity: 'danger', title: 'Pagamento de Frank (SaaS) falhou esta manha', description: 'Cartao recusado', createdAt: '2024-01-15T08:00:00Z' },
  { id: '2', severity: 'danger', title: 'Andre Oliveira nao loga ha 10 dias', description: 'Risco de churn alto', createdAt: '2024-01-15T06:00:00Z' },
  { id: '3', severity: 'warning', title: 'Cartao de Marina Costa expira em 5 dias', description: 'Enviar lembrete', createdAt: '2024-01-15T09:00:00Z' },
  { id: '4', severity: 'success', title: 'Luciana completou modulos PAIN', description: 'Oportunidade de upsell', createdAt: '2024-01-14T16:00:00Z' },
  { id: '5', severity: 'warning', title: 'Lead Roberto aguardando resposta ha 2h', description: 'Score 78 - quente', createdAt: '2024-01-15T10:00:00Z' },
];

// ==================== FINANCIAL DATA ====================
export const financialKPIs = {
  mrr: { value: 89500, change: 15, label: 'MRR' },
  totalRevenue: { value: 227000, change: 22, label: 'Receita Total' },
  accountsReceivable: { value: 35000, change: -8, label: 'A Receber' },
  netMargin: { value: 42, change: 3, label: 'Margem Liquida' },
};

export const chartCashFlow = [
  { month: 'Ago', entrada: 180000, saida: 95000 },
  { month: 'Set', entrada: 195000, saida: 102000 },
  { month: 'Out', entrada: 210000, saida: 98000 },
  { month: 'Nov', entrada: 225000, saida: 115000 },
  { month: 'Dez', entrada: 245000, saida: 125000 },
  { month: 'Jan', entrada: 227000, saida: 118000 },
];

export const chartRevenueByCategory = [
  { category: 'PAIN', value: 85000, fill: 'hsl(var(--chart-1))' },
  { category: 'SaaS', value: 32000, fill: 'hsl(var(--chart-2))' },
  { category: 'Imersao', value: 45000, fill: 'hsl(var(--chart-3))' },
  { category: 'Servicos', value: 65000, fill: 'hsl(var(--chart-4))' },
];
