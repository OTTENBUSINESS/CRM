import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

// Porteiro de 2FA (TOTP). Roda dentro do ProtectedRoute: se a conta tem um
// fator TOTP verificado mas a sessão ainda está em AAL1, exige o código de
// 6 dígitos antes de liberar o app (eleva a sessão para AAL2).
//
// Cache por sessão (módulo) pra não re-checar/re-flashar a cada navegação.
// Resetado quando há login/logout — aí o desafio é cobrado de novo.
let mfaResolved = false;
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT") mfaResolved = false;
});

type GateStatus = "checking" | "ok" | "challenge";

export function MfaGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [status, setStatus] = useState<GateStatus>(mfaResolved ? "ok" : "checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAal = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) {
        mfaResolved = true;
        setStatus("ok");
        return;
      }
      if (data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
        const { data: f } = await supabase.auth.mfa.listFactors();
        const totp = f?.totp?.[0];
        if (totp) {
          setFactorId(totp.id);
          setStatus("challenge");
        } else {
          mfaResolved = true;
          setStatus("ok");
        }
      } else {
        mfaResolved = true;
        setStatus("ok");
      }
    } catch {
      // Em erro de leitura, não trava o usuário (RLS/auth normais seguem valendo).
      mfaResolved = true;
      setStatus("ok");
    }
  }, []);

  useEffect(() => {
    if (mfaResolved) {
      setStatus("ok");
      return;
    }
    setStatus("checking");
    checkAal();
  }, [user, checkAal]);

  const verify = async () => {
    if (!factorId || code.length !== 6) return;
    setVerifying(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setVerifying(false);
    if (error) {
      setError("Código incorreto ou expirado. Tente de novo.");
      setCode("");
      return;
    }
    mfaResolved = true;
    setStatus("ok");
  };

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "challenge") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mx-auto">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-foreground">Verificação em 2 etapas</h2>
            <p className="text-sm text-muted-foreground">
              Digite o código de 6 dígitos do seu app autenticador
              (Google Authenticator, Authy...).
            </p>
          </div>
          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              onComplete={(v) => { if (v.length === 6) verify(); }}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="space-y-2">
            <Button onClick={verify} disabled={verifying || code.length !== 6} className="w-full">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
            </Button>
            <button
              onClick={() => signOut()}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar e sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
