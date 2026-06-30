import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, Loader2, Trash2, Smartphone } from "lucide-react";

interface VerifiedFactor {
  id: string;
  friendly_name?: string | null;
}

// Tela de Configurações → Segurança: gerencia 2FA (TOTP) da conta do usuário.
// Fluxo de ativação: enroll → mostra QR + segredo → usuário escaneia no app
// autenticador → digita o código de 6 dígitos → challengeAndVerify confirma.
export function SecuritySection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<VerifiedFactor[]>([]);

  // Estado do fluxo de ativação
  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [newFactorId, setNewFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp || []) as VerifiedFactor[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const cancelEnroll = () => {
    setEnrolling(false);
    setQr(null);
    setSecret(null);
    setNewFactorId(null);
    setCode("");
  };

  const startEnroll = async () => {
    setBusy(true);
    setEnrolling(true);
    setCode("");
    try {
      // Remove fatores TOTP não verificados pendentes (evita erro "factor already exists")
      const { data: all } = await supabase.auth.mfa.listFactors();
      const pendentes = (all?.all || []).filter(
        (f: any) => f.factor_type === "totp" && f.status !== "verified"
      );
      for (const f of pendentes) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error || !data) {
        toast({ title: "Erro ao iniciar 2FA", description: error?.message, variant: "destructive" });
        cancelEnroll();
        return;
      }
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setNewFactorId(data.id);
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async () => {
    if (!newFactorId || code.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: newFactorId, code });
    setBusy(false);
    if (error) {
      toast({ title: "Código incorreto", description: "Confira o código e tente de novo.", variant: "destructive" });
      setCode("");
      return;
    }
    toast({ title: "2FA ativado! 🔒", description: "A partir de agora, o código será pedido a cada login." });
    cancelEnroll();
    load();
  };

  const removeFactor = async (id: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "2FA desativado" });
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isActive = factors.length > 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <Alert className={isActive ? "border-green-500/30 bg-green-500/10" : "border-amber-500/30 bg-amber-500/10"}>
        {isActive ? (
          <ShieldCheck className="h-4 w-4 text-green-400" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-amber-400" />
        )}
        <AlertDescription className="text-foreground/80">
          {isActive
            ? "Verificação em 2 etapas (2FA) está ATIVA. A cada login, o código do app autenticador é exigido."
            : "Sua conta ainda NÃO tem 2FA. Altamente recomendado para contas administrativas e dados financeiros."}
        </AlertDescription>
      </Alert>

      {isActive && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            {factors.map((f) => (
              <div key={f.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{f.friendly_name || "App Autenticador"}</p>
                    <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px] px-1.5 py-0">
                      Verificado
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeFactor(f.id)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Remover
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!enrolling && (
        <Button variant={isActive ? "outline" : "default"} onClick={startEnroll} disabled={busy}>
          {isActive ? <Smartphone className="h-4 w-4 mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          {isActive ? "Adicionar outro dispositivo" : "Ativar 2FA"}
        </Button>
      )}

      {enrolling && (
        <Card>
          <CardContent className="pt-5 pb-5 space-y-5">
            <div className="space-y-1">
              <p className="font-medium text-sm">1. Escaneie o QR Code</p>
              <p className="text-xs text-muted-foreground">
                Abra o Google Authenticator, Authy ou similar e escaneie o código abaixo.
              </p>
            </div>

            {qr ? (
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-lg">
                  {qr.startsWith("<svg") ? (
                    <div dangerouslySetInnerHTML={{ __html: qr }} />
                  ) : (
                    <img src={qr} alt="QR Code 2FA" width={180} height={180} />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {secret && (
              <p className="text-center text-xs text-muted-foreground">
                Ou digite manualmente:{" "}
                <code className="font-mono text-foreground bg-muted px-1.5 py-0.5 rounded break-all">
                  {secret}
                </code>
              </p>
            )}

            <div className="space-y-2">
              <p className="font-medium text-sm">2. Digite o código gerado</p>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  onComplete={(v) => { if (v.length === 6) confirmEnroll(); }}
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={cancelEnroll} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={confirmEnroll} disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
