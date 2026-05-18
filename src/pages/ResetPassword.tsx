import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  // AuthContext handles PASSWORD_RECOVERY event and redirects here
  // We just need to check if we have a valid session
  useEffect(() => {
    const check = async () => {
      // Small delay to let AuthContext process the recovery token
      await new Promise(r => setTimeout(r, 500));
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
      } else {
        // Try once more after a bit
        await new Promise(r => setTimeout(r, 1500));
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s) {
          setSessionReady(true);
        } else {
          setSessionError(true);
        }
      }
    };
    check();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message === 'New password should be different from the old password.'
        ? 'A nova senha deve ser diferente da senha atual.'
        : 'Erro ao redefinir senha. Tente novamente.');
    } else {
      setSuccess(true);
      // Sign out so they log in fresh with new password
      await supabase.auth.signOut();
      setTimeout(() => navigate('/login'), 3000);
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">CRM AI-First</h1>
          <p className="text-slate-400">Control Tower</p>
        </div>

        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          {success ? (
            <div className="p-6 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto" />
              <h2 className="text-xl font-semibold text-white">Senha redefinida!</h2>
              <p className="text-slate-400 text-sm">
                Sua senha foi alterada com sucesso. Redirecionando para o login...
              </p>
              <div className="flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              </div>
            </div>
          ) : sessionError ? (
            <div className="p-6 text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto" />
              <h2 className="text-xl font-semibold text-white">Link expirado</h2>
              <p className="text-slate-400 text-sm">
                Este link de recuperação expirou ou já foi utilizado.
                Solicite um novo link na tela de login.
              </p>
              <Button
                onClick={() => navigate('/forgot-password')}
                className="mt-2 bg-orange-500 hover:bg-orange-600"
              >
                Solicitar novo link
              </Button>
            </div>
          ) : !sessionReady ? (
            <div className="p-6 text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500 mx-auto" />
              <p className="text-slate-400 text-sm">Validando link de recuperação...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle className="text-white">Nova senha</CardTitle>
                <CardDescription>
                  Defina sua nova senha. Use pelo menos 8 caracteres.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-slate-200">Nova senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                      required
                      minLength={8}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-slate-200">Confirmar senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                      required
                      minLength={8}
                    />
                  </div>
                </div>
                {password && password.length < 8 && (
                  <p className="text-amber-400 text-xs">Mínimo de 8 caracteres</p>
                )}
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-amber-400 text-xs">As senhas não coincidem</p>
                )}
                {error && (
                  <p className="text-red-400 text-sm bg-red-500/10 rounded-lg p-2 text-center">{error}</p>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  className="w-full bg-orange-500 hover:bg-orange-600"
                  disabled={isLoading || password.length < 8 || password !== confirmPassword}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Redefinir senha
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>

        <p className="text-center text-slate-500 text-sm mt-6">
          © 2025 CRM AI-First. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
