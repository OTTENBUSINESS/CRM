import { useEffect, useState } from "react";
import { Send, Loader2, Sparkles, Copy, MessageCircle, Instagram, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type Canal = "whatsapp" | "instagram_dm" | "email";

interface Props {
  open: boolean;
  onClose: () => void;
  diagnosticoId: string;
  leadNome?: string;
  leadTelefone?: string | null;
  leadInstagram?: string | null;
  leadEmail?: string | null;
}

export function EnviarDiagnosticoModal({
  open,
  onClose,
  diagnosticoId,
  leadNome,
  leadTelefone,
  leadInstagram,
  leadEmail,
}: Props) {
  const [canal, setCanal] = useState<Canal>("whatsapp");
  const [emailDestino, setEmailDestino] = useState("");
  const [emailAssunto, setEmailAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [gancho, setGancho] = useState("");
  const [variant, setVariant] = useState(0);
  const [includeLink, setIncludeLink] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const printUrl = typeof window !== "undefined"
    ? `${window.location.origin}/comercial/prospeccao/diagnostico/${diagnosticoId}/print`
    : "";

  useEffect(() => {
    if (!open) return;
    if (leadTelefone) setCanal("whatsapp");
    else if (leadInstagram) setCanal("instagram_dm");
    else if (leadEmail) setCanal("email");
    setEmailDestino(leadEmail || "");
    setEmailAssunto(leadNome ? `Diagnóstico de prospecção — ${leadNome}` : "Diagnóstico de prospecção");
  }, [open, leadTelefone, leadInstagram, leadEmail, leadNome]);

  useEffect(() => {
    if (!open) return;
    gerar(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canal]);

  const gerar = async (v = variant) => {
    setGenerating(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase.functions.invoke("prospeccao-gerar-mensagem", {
        body: { diagnostico_id: diagnosticoId, canal, variant: v, user_id: userId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setMensagem(data?.mensagem || "");
      setGancho(data?.gancho_principal || "");
      setVariant(v);
    } catch (err) {
      toast.error(`Erro IA: ${(err as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  const mensagemFinal = includeLink ? `${mensagem.trim()}\n\n${printUrl}` : mensagem;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mensagemFinal);
      toast.success("Copiado pra área de transferência");
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  const handleSendWhatsApp = async () => {
    if (!leadTelefone) return toast.error("Lead sem telefone");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-cloud", {
        body: { action: "send_text", phone: leadTelefone, text: mensagemFinal },
      });
      if (error) throw new Error(error.message);
      if (data?.window_closed) {
        toast.warning("Janela 24h fechada. Use template aprovado pra primeiro contato.");
      } else if (data?.error) {
        throw new Error(data.error);
      } else {
        toast.success("Mensagem enviada via WhatsApp ✅");
        onClose();
      }
    } catch (err) {
      toast.error(`Falha WhatsApp: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const handleOpenWhatsAppManual = () => {
    if (!leadTelefone) return;
    const phone = leadTelefone.replace(/\D/g, "");
    const formatted = phone.startsWith("55") ? phone : `55${phone}`;
    const url = `https://wa.me/${formatted}?text=${encodeURIComponent(mensagemFinal)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSendInstagramMock = async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));
    toast.success(`DM enviada pra @${leadInstagram} (mock)`);
    setSending(false);
    onClose();
  };

  const handleSendEmailMock = async () => {
    if (!emailDestino || !emailDestino.includes("@")) {
      return toast.error("Email destinatário inválido");
    }
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));
    toast.success(`Email enviado pra ${emailDestino} (mock)`);
    setSending(false);
    onClose();
  };

  const handleOpenMailto = () => {
    if (!emailDestino) return;
    const url = `mailto:${emailDestino}?subject=${encodeURIComponent(emailAssunto)}&body=${encodeURIComponent(mensagemFinal)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-primary mb-1">
            <Send className="h-3 w-3" />
            ENVIAR DIAGNÓSTICO
          </div>
          <DialogTitle>{leadNome || "Lead"}</DialogTitle>
          <DialogDescription>Mensagem gerada por IA com tom Frank — edita à vontade.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Canal */}
          <div className="flex gap-2">
            <ChannelButton
              active={canal === "whatsapp"}
              disabled={!leadTelefone}
              onClick={() => setCanal("whatsapp")}
              icon={<Phone className="h-4 w-4" />}
              label="WhatsApp"
              meta={leadTelefone || "sem telefone"}
            />
            <ChannelButton
              active={canal === "instagram_dm"}
              disabled={false}
              onClick={() => setCanal("instagram_dm")}
              icon={<Instagram className="h-4 w-4" />}
              label="DM Instagram"
              meta={leadInstagram ? `@${leadInstagram}` : "sem @ — mock"}
            />
            <ChannelButton
              active={canal === "email"}
              disabled={false}
              onClick={() => setCanal("email")}
              icon={<Mail className="h-4 w-4" />}
              label="Email"
              meta={leadEmail || "preencher abaixo"}
            />
          </div>

          {/* Campo de email — só pra canal email */}
          {canal === "email" && (
            <div className="space-y-2 rounded-md border border-border bg-card/40 p-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Destinatário
                </label>
                <input
                  type="email"
                  value={emailDestino}
                  onChange={(e) => setEmailDestino(e.target.value)}
                  placeholder="contato@empresa.com"
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Assunto
                </label>
                <input
                  type="text"
                  value={emailAssunto}
                  onChange={(e) => setEmailAssunto(e.target.value)}
                  placeholder="Diagnóstico de prospecção"
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              <p className="text-[10px] text-amber-500">⚠️ Envio por email está em modo mock — nada é disparado de verdade ainda.</p>
            </div>
          )}

          {/* Mensagem */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Mensagem (tom Frank)
              </label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => gerar((variant + 1) % 3)}
                disabled={generating}
                className="h-7 gap-1 text-xs"
              >
                <Sparkles className="h-3 w-3" />
                Regenerar
              </Button>
            </div>
            <div className="relative">
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder={generating ? "Gerando..." : "Mensagem aparecerá aqui..."}
                rows={9}
                disabled={generating}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none font-mono leading-relaxed"
              />
              {generating && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
            </div>
            {gancho && (
              <p className="text-[11px] text-muted-foreground">
                💡 Gancho: <span className="text-foreground/80">{gancho}</span>
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">{mensagem.length} chars</p>
          </div>

          {/* Anexar link */}
          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <Checkbox checked={includeLink} onCheckedChange={(v) => setIncludeLink(!!v)} className="mt-0.5" />
            <div className="space-y-1">
              <span>Anexar link do diagnóstico em PDF (público)</span>
              {includeLink && <code className="block text-[10px] text-muted-foreground break-all">{printUrl}</code>}
            </div>
          </label>
        </div>

        <DialogFooter className="flex-wrap">
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button variant="outline" onClick={handleCopy} className="gap-2">
            <Copy className="h-4 w-4" />Copiar
          </Button>
          {canal === "whatsapp" && leadTelefone && (
            <>
              <Button variant="outline" onClick={handleOpenWhatsAppManual} className="gap-2">
                <MessageCircle className="h-4 w-4" />Abrir WhatsApp
              </Button>
              <Button onClick={handleSendWhatsApp} disabled={sending} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar via Cloud API
              </Button>
            </>
          )}
          {canal === "instagram_dm" && (
            <Button onClick={handleSendInstagramMock} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}
              Enviar DM <span className="text-[10px] uppercase opacity-60">mock</span>
            </Button>
          )}
          {canal === "email" && (
            <>
              <Button variant="outline" onClick={handleOpenMailto} disabled={!emailDestino} className="gap-2">
                <Mail className="h-4 w-4" />Abrir cliente de email
              </Button>
              <Button onClick={handleSendEmailMock} disabled={sending || !emailDestino} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar email <span className="text-[10px] uppercase opacity-60">mock</span>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelButton({
  active, disabled, onClick, icon, label, meta,
}: {
  active: boolean; disabled: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; meta: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex items-center gap-2 rounded-lg border p-3 transition-colors text-left ${
        active
          ? "border-primary/50 bg-primary/5 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {icon}
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[10px] truncate">{meta}</div>
      </div>
    </button>
  );
}
