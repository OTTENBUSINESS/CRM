import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  User,
  Palette,
  Plug,
  Kanban,
  Sparkles,
  Package,
  FolderOpen,
  BookOpen,
  Zap,
  Bot,
  Headphones,
  Star,
  Users,
  Phone,
  Percent,
  Bell,
  Calendar,
  Smartphone,
  MessageSquare,
  Settings,
  LogOut,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

// === Section components ===
import { ProfileSection } from "@/components/settings/sections/ProfileSection";
import { GoogleCalendarSection } from "@/components/settings/sections/GoogleCalendarSection";
import { ThemeSection } from "@/components/settings/sections/ThemeSection";
import { IntegrationsSection } from "@/components/settings/sections/IntegrationsSection";
import { WhatsAppInstancesSection } from "@/components/settings/sections/WhatsAppInstancesSection";
import { ModulesSection } from "@/components/settings/sections/ModulesSection";
import { NotificationRulesBuilder } from "@/components/settings/NotificationRulesBuilder";
import { WhatsAppTaskBotConfig } from "@/components/settings/WhatsAppTaskBotConfig";

// === Comercial sub-tabs (reused) ===
import { PipelineConfigTab } from "@/components/settings/PipelineConfigTab";
import { AutomationRulesTab } from "@/components/settings/AutomationRulesTab";
import { TrainingCallsTab } from "@/components/settings/TrainingCallsTab";
import { AIAgentTab } from "@/components/sales/ai/AIAgentTab";
import { CoachPlaybooksTab } from "@/components/coach/CoachPlaybooksTab";
import { MaterialsTabContent } from "@/pages/SalesMaterialsConfig";
import { WavoipAdminPanel } from "@/components/calls";

import {
  AnalysisTemplatesTab,
  ProductsTab,
  CommissionsTab,
  TeamTab,
  PlaybooksTab,
} from "@/pages/SalesSettingsTabs";

// =====================================================
// NAVIGATION — cada item tem descrição clara
// =====================================================

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Aparece no header da seção quando selecionada */
  description: string;
  /** Aparece como tooltip/hint na sidebar */
  hint?: string;
  adminOnly?: boolean;
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

const navigationSections: NavSection[] = [
  {
    id: "geral",
    label: "Geral",
    items: [
      {
        id: "modulos",
        label: "Módulos",
        icon: LayoutGrid,
        description: "Escolha quais módulos do CRM ficam ativos. Desative o que não usa para simplificar o menu.",
        hint: "Ativar/desativar módulos",
      },
      {
        id: "perfil",
        label: "Meu Perfil",
        icon: User,
        description: "Seu nome, email e time. Essas informações aparecem nos relatórios e atividades do CRM.",
      },
      {
        id: "aparencia",
        label: "Aparência",
        icon: Palette,
        description: "Escolha entre tema claro ou escuro. A mudança é aplicada instantaneamente.",
      },
      {
        id: "google-calendar",
        label: "Google Calendar",
        icon: Calendar,
        description: "Conecte sua agenda do Google para criar reuniões com link do Meet automaticamente e sincronizar eventos.",
      },
    ],
  },
  {
    id: "integracoes",
    label: "Integrações",
    items: [
      {
        id: "api-keys",
        label: "Chaves de API",
        icon: Plug,
        description: "Configure as chaves de acesso das APIs externas. Sem essas chaves, os recursos de IA, WhatsApp, pagamento e email não funcionam.",
        hint: "Anthropic, OpenAI, Asaas...",
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        icon: Smartphone,
        description: "Gerencie suas instâncias de WhatsApp. Conecte via QR Code e veja o status de cada número.",
      },
      {
        id: "wavoip",
        label: "Telefonia (VoIP)",
        icon: Phone,
        description: "Configure dispositivos WaVoIP para fazer e receber ligações pelo CRM. As ligações são gravadas e transcritas pela IA.",
      },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    items: [
      {
        id: "pipeline",
        label: "Pipeline",
        icon: Kanban,
        description: "Defina as etapas do seu funil de vendas. Cada etapa representa uma fase da negociação (ex: Qualificação → Proposta → Fechamento).",
      },
      {
        id: "templates",
        label: "Templates de IA",
        icon: Sparkles,
        description: "Crie prompts reutilizáveis para a IA analisar ligações, emails e reuniões. Ex: 'Analise o tom da conversa e sugira próximos passos'.",
      },
      {
        id: "produtos",
        label: "Produtos",
        icon: Package,
        description: "Cadastre os produtos/serviços que sua empresa vende. Eles aparecem ao criar propostas e calcular comissões.",
      },
      {
        id: "materiais",
        label: "Materiais de Venda",
        icon: FolderOpen,
        description: "Faça upload de PDFs, apresentações e documentos que o time comercial usa no dia a dia. Acessíveis com um clique.",
      },
      {
        id: "playbooks",
        label: "Playbooks",
        icon: BookOpen,
        description: "Roteiros de vendas passo a passo. A IA usa esses playbooks para sugerir o que falar em cada etapa da negociação.",
      },
      {
        id: "comissoes",
        label: "Comissões",
        icon: Percent,
        description: "Defina regras de comissionamento: percentual por produto, bônus por meta, split entre vendedores. O cálculo é automático.",
      },
      {
        id: "automacoes",
        label: "Automações",
        icon: Zap,
        description: "Regras automáticas: quando um lead muda de etapa, dispare WhatsApp, crie tarefa, notifique o gestor, etc.",
      },
    ],
  },
  {
    id: "ia-bots",
    label: "IA & Bots",
    items: [
      {
        id: "agente-ia",
        label: "Agente de Vendas",
        icon: Bot,
        description: "IA que responde leads no WhatsApp automaticamente. Configure personalidade, horário de funcionamento e regras de escalonamento.",
      },
      {
        id: "coach",
        label: "Coach de Vendas",
        icon: Headphones,
        description: "IA que analisa ligações do time comercial e dá feedback sobre tom de voz, objeções não tratadas e oportunidades perdidas.",
      },
    ],
  },
  {
    id: "equipe",
    label: "Equipe",
    items: [
      {
        id: "membros",
        label: "Membros do Time",
        icon: Users,
        description: "Adicione, edite e desative membros da equipe. Defina cargos (admin, vendedor, closer, SDR) e permissões de acesso.",
      },
      {
        id: "treinamento",
        label: "Treinamento",
        icon: Star,
        description: "Ligações marcadas para treinamento. Ouça gravações com a equipe e use a análise da IA para capacitar vendedores.",
        adminOnly: true,
      },
    ],
  },
  {
    id: "notificacoes",
    label: "Notificações",
    items: [
      {
        id: "regras-notificacao",
        label: "Regras de Alerta",
        icon: Bell,
        description: "Crie regras como: 'Se um deal ficar 3 dias sem atualização, notifique o vendedor'. Personalize por etapa, time e canal.",
      },
      {
        id: "bot-tarefas",
        label: "Bot de Tarefas",
        icon: MessageSquare,
        description: "Bot que envia lembretes de tarefas via WhatsApp. 'Bom dia! Você tem 3 follow-ups pendentes para hoje.'",
      },
    ],
  },
];

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function SettingsUnified() {
  const { teamMember, signOut } = useAuth();
  const isAdmin = teamMember?.role === "admin" || teamMember?.role === "diretor";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get("s") || "modulos";

  const handleNavigate = (sectionId: string) => {
    setSearchParams({ s: sectionId });
  };

  // Filter out admin-only items
  const filteredSections = useMemo(() => {
    return navigationSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.adminOnly || isAdmin),
      }))
      .filter((section) => section.items.length > 0);
  }, [isAdmin]);

  // Find active item info
  const activeItem = useMemo(() => {
    for (const section of filteredSections) {
      const item = section.items.find((i) => i.id === activeSection);
      if (item) return item;
    }
    return filteredSections[0]?.items[0];
  }, [activeSection, filteredSections]);

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* ===== LEFT SIDEBAR ===== */}
        <aside className="w-[260px] shrink-0 border-r border-border/50 bg-background/50">
          <ScrollArea className="h-full">
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center gap-2.5 mb-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Settings className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold">Configurações</h2>
              </div>

              {/* Navigation */}
              <nav className="space-y-5">
                {filteredSections.map((section) => (
                  <div key={section.id}>
                    <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-1.5 px-2">
                      {section.label}
                    </p>
                    <div className="space-y-0.5">
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeSection === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleNavigate(item.id)}
                            title={item.hint || item.description}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-all duration-150",
                              "text-[13px]",
                              isActive
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            <Icon
                              className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                isActive ? "text-primary" : "text-muted-foreground/60"
                              )}
                            />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              {/* Sign Out */}
              <div className="mt-6 pt-4 border-t border-border/50">
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-[13px] text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sair da conta</span>
                </button>
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* ===== CONTENT AREA ===== */}
        <main className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="max-w-4xl p-6 lg:p-8">
              {/* Section header with description */}
              {activeItem && (
                <div className="mb-6 pb-4 border-b border-border/30">
                  <h1 className="text-xl font-semibold text-foreground">{activeItem.label}</h1>
                  <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
                    {activeItem.description}
                  </p>
                </div>
              )}

              {/* Dynamic content */}
              <SettingsContent section={activeSection} />
            </div>
          </ScrollArea>
        </main>
      </div>
    </AppLayout>
  );
}

// =====================================================
// CONTENT ROUTER
// =====================================================

function SettingsContent({ section }: { section: string }) {
  switch (section) {
    // Geral
    case "modulos":
      return <ModulesSection />;
    case "perfil":
      return <ProfileSection />;
    case "aparencia":
      return <ThemeSection />;
    case "google-calendar":
      return <GoogleCalendarSection />;

    // Integrações
    case "api-keys":
      return <IntegrationsSection />;
    case "whatsapp":
      return <WhatsAppInstancesSection />;
    case "wavoip":
      return <WavoipAdminPanel />;

    // Comercial
    case "pipeline":
      return <PipelineConfigTab />;
    case "templates":
      return <AnalysisTemplatesTab />;
    case "produtos":
      return <ProductsTab />;
    case "materiais":
      return <MaterialsTabContent />;
    case "playbooks":
      return <PlaybooksTab />;
    case "comissoes":
      return <CommissionsTab />;
    case "automacoes":
      return <AutomationRulesTab />;

    // IA & Bots
    case "agente-ia":
      return <AIAgentTab />;
    case "coach":
      return <CoachPlaybooksTab />;

    // Equipe
    case "membros":
      return <TeamTab />;
    case "treinamento":
      return <TrainingCallsTab />;

    // Notificações
    case "regras-notificacao":
      return <NotificationRulesBuilder />;
    case "bot-tarefas":
      return <WhatsAppTaskBotConfig />;

    default:
      return <ModulesSection />;
  }
}
