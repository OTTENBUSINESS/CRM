import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError('Erro ao enviar email. Tente novamente.');
    } else {
      setSent(true);
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
          {sent ? (
            <div className="p-6 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto" />
              <h2 className="text-xl font-semibold text-white">Email enviado!</h2>
              <p className="text-slate-400 text-sm">
                Se existe uma conta com o email <strong className="text-slate-300">{email}</strong>,
                voce receberá um link para redefinir sua senha.
              </p>
              <p className="text-slate-500 text-xs">
                Verifique também a pasta de spam.
              </p>
              <Link to="/login">
                <Button variant="outline" className="mt-4 border-slate-600 text-slate-300 hover:bg-slate-700">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar ao login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle className="text-white">Esqueceu sua senha?</CardTitle>
                <CardDescription>
                  Informe seu email e enviaremos um link para redefinir sua senha.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="text-slate-200">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                {error && (
                  <p className="text-red-400 text-sm bg-red-500/10 rounded-lg p-2 text-center">{error}</p>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button
                  type="submit"
                  className="w-full bg-orange-500 hover:bg-orange-600"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar link de recuperação
                </Button>
                <Link to="/login" className="text-sm text-slate-400 hover:text-slate-300 transition-colors">
                  <ArrowLeft className="h-3 w-3 inline mr-1" />
                  Voltar ao login
                </Link>
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
