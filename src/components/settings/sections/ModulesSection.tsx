import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import {
  DollarSign,
  ClipboardList,
  Phone,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

// =====================================================
// MODULE DEFINITIONS
// =====================================================

interface ModuleDef {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  defaultEnabled: boolean;
  category: "core" | "channel" | "advanced";
}

const MODULES: ModuleDef[] = [
  // Core modules
  {
    id: "comercial",
    label: "Comercial",
    description: "Pipeline de vendas, leads, deals, propostas e todo o funil comercial. Inclui Cockpit do vendedor, inbox de WhatsApp comercial, agenda e treinamento.",
    icon: DollarSign,
    defaultEnabled: true,
    category: "core",
  },
  {
    id: "gestao",
    label: "Gestão Básica",
    description: "Tarefas da equipe, calendário compartilhado e reuniões com IA (gravação + resumo automático).",
    icon: ClipboardList,
    defaultEnabled: true,
    category: "core",
  },

  // Channels
  {
    id: "telefonia",
    label: "Telefonia (VoIP)",
    description: "Ligações via WaVoIP integradas ao WhatsApp. Gravação automática, transcrição por IA (Soniox) e análise de sentimento.",
    icon: Phone,
    defaultEnabled: false,
    category: "channel",
  },

  // Advanced
  {
    id: "analytics",
    label: "Analytics Avançado",
    description: "Dashboards detalhados, métricas de conversão por etapa, análise de performance individual e previsão de receita com IA.",
    icon: BarChart3,
    defaultEnabled: false,
    category: "advanced",
  },
];

const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  core: {
    label: "Módulos Principais",
    description: "Funcionalidades centrais do CRM. Ative apenas o que sua empresa usa."
  },
  channel: {
    label: "Canais de Comunicação",
    description: "Canais extras além do WhatsApp (que já vem ativo por padrão)."
  },
  advanced: {
    label: "Recursos Avançados",
    description: "Funcionalidades que exigem mais configuração ou integrações externas."
  },
};

// =====================================================
// CONFIG KEY
// =====================================================
const CONFIG_KEY = "enabled_modules";

export function ModulesSection() {
  const { toast } = useToast();
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      const { data, error } = await supabase
        .from("config")
        .select("value")
        .eq("key", CONFIG_KEY)
        .maybeSingle();

      if (data?.value) {
        try {
          setEnabledModules(JSON.parse(data.value));
        } catch {
          initDefaults();
        }
      } else {
        initDefaults();
      }
    } catch {
      initDefaults();
    } finally {
      setLoading(false);
    }
  };

  const initDefaults = () => {
    const defaults: Record<string, boolean> = {};
    MODULES.forEach((m) => {
      defaults[m.id] = m.defaultEnabled;
    });
    setEnabledModules(defaults);
  };

  const handleToggle = async (moduleId: string, enabled: boolean) => {
    const updated = { ...enabledModules, [moduleId]: enabled };
    setEnabledModules(updated);
    setSaving(true);

    try {
      const { error } = await supabase.from("config").upsert(
        {
          key: CONFIG_KEY,
          value: JSON.stringify(updated),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
      if (error) throw error;

      const mod = MODULES.find((m) => m.id === moduleId);
      toast({
        title: enabled
          ? `${mod?.label} ativado`
          : `${mod?.label} desativado`,
        description: enabled
          ? "O módulo aparecerá no menu lateral"
          : "O módulo será ocultado do menu lateral",
      });
    } catch {
      // Revert
      setEnabledModules((prev) => ({ ...prev, [moduleId]: !enabled }));
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isEnabled = (moduleId: string) => {
    if (enabledModules[moduleId] !== undefined) return enabledModules[moduleId];
    return MODULES.find((m) => m.id === moduleId)?.defaultEnabled ?? false;
  };

  // Group by category
  const grouped = MODULES.reduce(
    (acc, mod) => {
      if (!acc[mod.category]) acc[mod.category] = [];
      acc[mod.category].push(mod);
      return acc;
    },
    {} as Record<string, ModuleDef[]>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Info banner */}
      <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
        <p className="text-sm text-foreground font-medium mb-1">
          💡 Ative apenas o que você precisa
        </p>
        <p className="text-xs text-muted-foreground">
          Módulos desativados ficam ocultos no menu lateral e não consomem recursos.
          Você pode ativar ou desativar a qualquer momento sem perder dados.
        </p>
      </div>

      {(["core", "channel", "advanced"] as const).map((category) => {
        const items = grouped[category];
        if (!items?.length) return null;
        const catInfo = CATEGORY_LABELS[category];

        return (
          <div key={category}>
            <div className="mb-3">
              <h3 className="text-sm font-medium text-foreground">{catInfo.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{catInfo.description}</p>
            </div>
            <div className="space-y-2">
              {items.map((mod) => {
                const Icon = mod.icon;
                const enabled = isEnabled(mod.id);

                return (
                  <Card
                    key={mod.id}
                    className={`transition-all duration-200 ${
                      enabled
                        ? "border-primary/20 bg-primary/[0.02]"
                        : "border-border/50 opacity-70"
                    }`}
                  >
                    <CardContent className="py-4 px-4">
                      <div className="flex items-start gap-4">
                        <div
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                            enabled
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium">{mod.label}</p>
                            {mod.defaultEnabled && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary/70">
                                Recomendado
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {mod.description}
                          </p>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(val) => handleToggle(mod.id, val)}
                          className="shrink-0 mt-1"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {saving && (
        <div className="fixed bottom-4 right-4 bg-background border border-border rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg z-50">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Salvando...</span>
        </div>
      )}
    </div>
  );
}

// =====================================================
// HOOK: useEnabledModules — for sidebar filtering
// =====================================================

export function useEnabledModules() {
  const [modules, setModules] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from("config")
          .select("value")
          .eq("key", CONFIG_KEY)
          .maybeSingle();

        if (data?.value) {
          setModules(JSON.parse(data.value));
        } else {
          // defaults
          const defaults: Record<string, boolean> = {};
          MODULES.forEach((m) => {
            defaults[m.id] = m.defaultEnabled;
          });
          setModules(defaults);
        }
      } catch {
        const defaults: Record<string, boolean> = {};
        MODULES.forEach((m) => {
          defaults[m.id] = m.defaultEnabled;
        });
        setModules(defaults);
      }
    };
    load();
  }, []);

  const isModuleEnabled = (moduleId: string) => {
    if (!modules) return true; // while loading, show everything
    if (modules[moduleId] !== undefined) return modules[moduleId];
    return MODULES.find((m) => m.id === moduleId)?.defaultEnabled ?? true;
  };

  return { modules, isModuleEnabled, loading: modules === null };
}
