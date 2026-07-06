import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Settings, Save, Loader2, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePromptsConfig, useUpdatePromptConfig } from "../hooks/useProspeccao";
import type { PromptConfig } from "../lib/api";

const TONS_VOZ = [
  { id: "frank_costa", label: "🔥 Frank Costa (direto, chicote da verdade)", emoji: "🔥" },
  { id: "neutro", label: "👔 Consultor neutro (formal, técnico)", emoji: "👔" },
  { id: "coach", label: "🤝 Coach acolhedor (empático)", emoji: "🤝" },
  { id: "b2b", label: "⚡ Especialista B2B (data-driven)", emoji: "⚡" },
];

const MODELOS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (rápido, barato)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (melhor qualidade)" },
];

export default function ProspeccaoConfiguracoes() {
  const { data: prompts, isLoading } = usePromptsConfig();
  const { mutateAsync: update, isPending: saving } = useUpdatePromptConfig();

  const [activeKey, setActiveKey] = useState<string>("");
  const [draft, setDraft] = useState<Partial<PromptConfig>>({});

  useEffect(() => {
    if (prompts && prompts.length > 0 && !activeKey) {
      setActiveKey(prompts[0].key);
    }
  }, [prompts, activeKey]);

  const active = prompts?.find((p) => p.key === activeKey);
  const current: PromptConfig | null = active ? { ...active, ...draft } : null;
  const dirty = Object.keys(draft).length > 0;

  useEffect(() => {
    setDraft({});
  }, [activeKey]);

  const handleSave = async () => {
    if (!active) return;
    await update({
      id: active.id,
      patch: {
        prompt_text: draft.prompt_text ?? active.prompt_text,
        ai_model: draft.ai_model ?? active.ai_model,
        temperature: draft.temperature ?? active.temperature,
        tom_voz: draft.tom_voz ?? active.tom_voz,
        is_active: draft.is_active ?? active.is_active,
      },
    });
    setDraft({});
  };

  const insertVar = (varKey: string) => {
    const text = current?.prompt_text || active?.prompt_text || "";
    const insertion = `{{${varKey}}}`;
    setDraft({ ...draft, prompt_text: text + insertion });
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-3">
            <Settings className="h-3.5 w-3.5" />
            Prospecção
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Configuração das IAs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edita os prompts que cada análise usa. Mudanças são aplicadas na próxima rodada — sem deploy.
          </p>
        </motion.div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {prompts && prompts.length > 0 && (
          <div className="mt-8 grid grid-cols-[260px_1fr] gap-6">
            {/* Tabs lateral */}
            <div className="space-y-2">
              {prompts.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setActiveKey(p.key)}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                    p.key === activeKey
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:border-foreground/30"
                  }`}
                >
                  <div className="font-medium text-sm text-foreground">{p.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                    {p.descricao}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1.5 flex items-center gap-2">
                    <span>{p.ai_model}</span>
                    <span>·</span>
                    <span>temp {p.temperature}</span>
                    <span>·</span>
                    <span>{p.tom_voz}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Editor */}
            {current && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h2 className="font-semibold text-lg">{current.label}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">{current.descricao}</p>
                    </div>
                    {dirty && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDraft({})}
                          className="text-xs"
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Descartar
                        </Button>
                        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Salvar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modelo + Temp + Tom */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-semibold text-muted-foreground mb-1.5 tracking-wider">
                      Modelo IA
                    </label>
                    <select
                      value={current.ai_model}
                      onChange={(e) => setDraft({ ...draft, ai_model: e.target.value })}
                      className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                    >
                      {MODELOS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-semibold text-muted-foreground mb-1.5 tracking-wider">
                      Temperature ({current.temperature})
                    </label>
                    <Input
                      type="number"
                      step={0.1}
                      min={0}
                      max={1}
                      value={current.temperature}
                      onChange={(e) =>
                        setDraft({ ...draft, temperature: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-semibold text-muted-foreground mb-1.5 tracking-wider">
                      Tom de voz
                    </label>
                    <select
                      value={current.tom_voz}
                      onChange={(e) => setDraft({ ...draft, tom_voz: e.target.value })}
                      className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                    >
                      {TONS_VOZ.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Variáveis disponíveis */}
                {current.variables_help && Object.keys(current.variables_help).length > 0 && (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                    <div className="text-[11px] uppercase font-semibold text-muted-foreground mb-2 tracking-wider">
                      Variáveis disponíveis · clique pra inserir
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(current.variables_help).map(([k, desc]) => (
                        <button
                          key={k}
                          onClick={() => insertVar(k)}
                          title={desc}
                          className="text-xs font-mono px-2 py-1 rounded bg-background border border-border hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          {`{{${k}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Editor textarea */}
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-muted-foreground mb-1.5 tracking-wider">
                    Prompt completo
                  </label>
                  <textarea
                    value={current.prompt_text || ""}
                    onChange={(e) => setDraft({ ...draft, prompt_text: e.target.value })}
                    rows={32}
                    className="w-full rounded-md border border-border bg-background px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                    <span>{(current.prompt_text || "").length} chars</span>
                    <span>
                      Última edição: {active?.updated_at ? new Date(active.updated_at).toLocaleString("pt-BR") : "—"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
