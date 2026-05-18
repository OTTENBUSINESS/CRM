import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  Eye,
  EyeOff,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";

// =====================================================
// INTEGRATION DEFINITIONS
// =====================================================

interface IntegrationDef {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  docsUrl?: string;
  category: "ai" | "whatsapp" | "telephony" | "payment" | "email" | "other";
}

const INTEGRATIONS: IntegrationDef[] = [
  // AI
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic (Claude)",
    description: "Usado pelo Agente de Vendas, Coach, CEO Bot e análises de IA",
    placeholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    category: "ai",
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI (GPT)",
    description: "Alternativa para análises e geração de conteúdo",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    category: "ai",
  },
  {
    key: "GEMINI_API_KEY",
    label: "Google Gemini",
    description: "Alternativa para análises e geração de conteúdo",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    category: "ai",
  },
  // WhatsApp
  {
    key: "UAZAPI_ADMIN_URL",
    label: "UAZAPI — URL do Servidor",
    description: "URL base do seu servidor UAZAPI. Todas as instâncias são criadas e gerenciadas a partir dessa URL.",
    placeholder: "https://meuservidor.uazapi.com",
    docsUrl: "https://uazapi.com",
    category: "whatsapp",
  },
  {
    key: "UAZAPI_ADMIN_TOKEN",
    label: "UAZAPI — Token Admin",
    description: "Token de administrador do UAZAPI. Necessário para criar/listar instâncias e configurar webhooks.",
    placeholder: "admin-token-...",
    docsUrl: "https://uazapi.com",
    category: "whatsapp",
  },
  {
    key: "WHATSAPP_CLOUD_TOKEN",
    label: "WhatsApp Cloud API — Token",
    description: "Token de acesso da API oficial do WhatsApp Business (Meta)",
    placeholder: "EAAx...",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    category: "whatsapp",
  },
  {
    key: "WHATSAPP_PHONE_NUMBER_ID",
    label: "WhatsApp Cloud API — Phone Number ID",
    description: "ID do número do WhatsApp Business (Meta Dashboard > WhatsApp > API Setup)",
    placeholder: "663196283535436",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    category: "whatsapp",
  },
  // Telephony
  {
    key: "SONIOX_API_KEY",
    label: "Soniox",
    description: "Transcrição de áudio em tempo real para ligações",
    placeholder: "soniox_...",
    docsUrl: "https://soniox.com",
    category: "telephony",
  },
  // WaVoIP não usa chave global — o token é por device em /configuracoes > Telefonia (VoIP)
  // Payment
  {
    key: "ASAAS_API_KEY",
    label: "Asaas",
    description: "Gateway de pagamento: cobranças, boletos, PIX",
    placeholder: "$aact_...",
    docsUrl: "https://docs.asaas.com",
    category: "payment",
  },
  // Email
  {
    key: "RESEND_API_KEY",
    label: "Resend",
    description: "Envio de emails transacionais e campanhas",
    placeholder: "re_...",
    docsUrl: "https://resend.com/api-keys",
    category: "email",
  },
  // Google
  {
    key: "GOOGLE_CLIENT_ID",
    label: "Google Client ID",
    description: "ID do aplicativo OAuth do Google. Necessário para integração com Google Calendar e Meet",
    placeholder: "123456789-xxxxx.apps.googleusercontent.com",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    category: "other",
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    label: "Google Client Secret",
    description: "Secret do aplicativo OAuth do Google. Usado pela Edge Function para trocar tokens",
    placeholder: "GOCSPX-...",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    category: "other",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  ai: "Inteligência Artificial",
  whatsapp: "WhatsApp",
  telephony: "Telefonia",
  payment: "Pagamentos",
  email: "Email",
  other: "Google & Outros",
};

// =====================================================
// MAIN COMPONENT
// =====================================================

export function IntegrationsSection() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Load existing keys on mount
  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      const { data, error } = await supabase
        .from("config")
        .select("key, value")
        .in(
          "key",
          INTEGRATIONS.map((i) => i.key)
        );

      if (error) throw error;

      const keyMap: Record<string, string> = {};
      (data || []).forEach((row: any) => {
        keyMap[row.key] = row.value || "";
      });
      setKeys(keyMap);
    } catch (err) {
      console.error("Error loading integration keys:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (integration: IntegrationDef) => {
    setSaving((prev) => ({ ...prev, [integration.key]: true }));
    try {
      const value = keys[integration.key] || "";

      // Upsert into config table
      const { error } = await supabase.from("config").upsert(
        { key: integration.key, value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

      if (error) throw error;

      toast({ title: `${integration.label} salvo com sucesso` });
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: "Verifique a conexão e tente novamente",
        variant: "destructive",
      });
    } finally {
      setSaving((prev) => ({ ...prev, [integration.key]: false }));
    }
  };

  const toggleVisibility = (key: string) => {
    setVisibleKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const maskValue = (value: string) => {
    if (!value || value.length < 8) return "••••••••";
    return value.slice(0, 4) + "••••••••" + value.slice(-4);
  };

  // Group by category
  const grouped = INTEGRATIONS.reduce(
    (acc, integration) => {
      if (!acc[integration.category]) acc[integration.category] = [];
      acc[integration.category].push(integration);
      return acc;
    },
    {} as Record<string, IntegrationDef[]>
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
      <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
        <p className="text-sm text-foreground/80">
          ⚠️ As chaves de API são armazenadas de forma segura no banco de dados e acessadas apenas
          pelas Edge Functions no servidor. Nunca são expostas no frontend.
        </p>
      </div>

      {Object.entries(grouped).map(([category, integrations]) => (
        <div key={category}>
          <h3 className="text-sm font-medium text-muted-foreground/80 uppercase tracking-wider mb-3">
            {CATEGORY_LABELS[category] || category}
          </h3>
          <div className="space-y-3">
            {integrations.map((integration) => {
              const value = keys[integration.key] || "";
              const isVisible = visibleKeys[integration.key];
              const isConfigured = !!value;
              const isSaving = saving[integration.key];

              return (
                <Card key={integration.key}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{integration.label}</p>
                          <Badge
                            variant={isConfigured ? "default" : "secondary"}
                            className={`text-[10px] px-1.5 py-0 ${
                              isConfigured
                                ? "bg-green-500/10 text-green-400 border-green-500/20"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isConfigured ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Configurado
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <XCircle className="h-3 w-3" />
                                Pendente
                              </span>
                            )}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                          {integration.description}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={isVisible ? "text" : "password"}
                              value={keys[integration.key] || ""}
                              onChange={(e) =>
                                setKeys((prev) => ({
                                  ...prev,
                                  [integration.key]: e.target.value,
                                }))
                              }
                              placeholder={integration.placeholder}
                              className="pr-10 font-mono text-xs h-9"
                            />
                            <button
                              type="button"
                              onClick={() => toggleVisibility(integration.key)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {isVisible ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSave(integration)}
                            disabled={isSaving}
                            className="h-9 px-3"
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                    {integration.docsUrl && (
                      <a
                        href={integration.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-primary mt-2 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Obter chave de API
                      </a>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
