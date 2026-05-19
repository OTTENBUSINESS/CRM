import React, { useEffect, Component, type ReactNode, type ErrorInfo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CallProvider } from "@/contexts/CallContext";
import { MeetingProvider } from "@/contexts/MeetingContext";
import { GlobalTranscriptionPanel } from "@/components/meeting/GlobalTranscriptionPanel";
import { MeetingRecoveryBanner } from "@/components/meeting/MeetingRecoveryBanner";
import { NotificationProvider } from "@/hooks/useNotifications";
import { CallModals } from "@/components/calls";
import { FocusModeProvider } from "@/contexts/FocusModeContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { FocusModeOverlay } from "@/components/focus-mode/FocusModeOverlay";

// Error Boundary para componentes auxiliares (toast discreto)
class ErrorBoundary extends Component<{ children: ReactNode; name?: string }, { hasError: boolean; error?: Error }> {
  state = { hasError: false, error: undefined as Error | undefined };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed bottom-4 right-4 z-50 bg-red-50 border border-red-200 rounded-lg p-3 max-w-sm shadow-lg">
          <p className="text-sm font-medium text-red-800">Erro no componente{this.props.name ? ` ${this.props.name}` : ''}</p>
          <p className="text-xs text-red-600 mt-1">{this.state.error?.message}</p>
          <button className="text-xs text-red-700 underline mt-2" onClick={() => this.setState({ hasError: false })}>Tentar novamente</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Error Boundary para rotas — tela cheia com reload
class RouteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  state = { hasError: false, error: undefined as Error | undefined };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[RouteErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="text-center max-w-md space-y-4">
            <div className="text-4xl">:(</div>
            <h1 className="text-xl font-bold text-foreground">Algo deu errado</h1>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || 'Erro inesperado na aplicação'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                onClick={() => this.setState({ hasError: false })}
              >
                Tentar novamente
              </button>
              <button
                className="px-4 py-2 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted/80"
                onClick={() => window.location.reload()}
              >
                Recarregar pagina
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Auth pages
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// Settings unificada + WhatsApp
import SettingsUnified from "./pages/SettingsUnified";
const MyWhatsApp = React.lazy(() => import("./pages/MyWhatsApp"));

// Sales/Commercial pages (core CRM)
import SalesDashboard from "./pages/SalesDashboardV3";
import SalesLeads from "./pages/SalesLeads";
import SalesPipeline from "./pages/SalesPipeline";
import SalesDeals from "./pages/SalesDeals";
import SalesWhatsAppInbox from "./pages/SalesWhatsAppInbox";
import SalesLeadDetail from "./pages/SalesLeadDetail";
import SalesDealDetail from "./pages/SalesDealDetail";
import Products from "./pages/Products";
import Commissions from "./pages/Commissions";
import SalesPlaybook from "./pages/SalesPlaybook";
import SalesWorkspace from "./pages/SalesWorkspace";
import SalesAgenda from "./pages/SalesAgendaV2";
import SalesMaterialsConfig from "./pages/SalesMaterialsConfig";
import SalesTraining from "./pages/SalesTraining";
import CockpitShell from "./pages/CockpitShell";

// Gestão básica
import TaskManagement from "./pages/TaskManagement";
import TeamCalendar from "./pages/TeamCalendar";
import TeamMeetings from "./pages/TeamMeetings";

// Admin
import AdminUsers from "./pages/AdminUsers";

// Public booking
const BookMeeting = React.lazy(() => import("./pages/BookMeeting"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        const status = error?.status || error?.code;
        const msg = error?.message || '';
        console.warn(`[RQ] Query falhou (tentativa ${failureCount + 1}):`, status, msg);
        // Não retry em erros de auth (401/403) — recovery cuida disso
        if (status === 401 || status === 403) return false;
        // Até 3 retries com backoff para erros de rede/timeout
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      staleTime: 30000, // 30s - evita refetch excessivo
      refetchOnWindowFocus: true, // Re-habilitado — essencial para recovery de queries que falharam
      refetchOnReconnect: true,
      gcTime: 1000 * 60 * 10, // 10 min — cache persiste mais tempo, evita loading ao voltar
    },
  },
});

// Rota protegida apenas para admin e diretor
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { canAccessSettings, loading } = useAuth();
  if (loading) return null;
  if (!canAccessSettings) return <Navigate to="/comercial" replace />;
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isPasswordRecovery, teamMember, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If user is in password recovery mode, redirect to reset page
  if (isPasswordRecovery) {
    return <Navigate to="/reset-password" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Usuário bloqueado: exibe tela de acesso negado
  if (teamMember && teamMember.is_active === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 mx-auto">
            <span className="text-3xl">🔒</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground">Acesso bloqueado</h2>
          <p className="text-sm text-muted-foreground">
            Sua conta foi bloqueada. Entre em contato com o administrador do sistema.
          </p>
          <button
            onClick={() => signOut()}
            className="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-4 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Escuta eventos 'app-navigate' disparados de fora do BrowserRouter (ex: notificações)
// e faz navegação client-side sem recarregar a página (preserva chamadas WaVoIP ativas)
const NavigationListener = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      if (url) navigate(url);
    };
    window.addEventListener('app-navigate', handler);
    return () => window.removeEventListener('app-navigate', handler);
  }, [navigate]);
  return null;
};

const AppRoutes = () => {
  return (
    <Routes>
      {/* Rotas públicas */}
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/agendar" element={
        <React.Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div></div>}>
          <BookMeeting />
        </React.Suspense>
      } />

      {/* Home → Dashboard Comercial */}
      <Route path="/" element={<Navigate to="/comercial" replace />} />

      {/* Configurações — apenas admin e diretor */}
      <Route path="/configuracoes" element={<ProtectedRoute><AdminRoute><SettingsUnified /></AdminRoute></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AdminRoute><Navigate to="/configuracoes" replace /></AdminRoute></ProtectedRoute>} />
      <Route path="/whatsapp" element={<ProtectedRoute><AdminRoute><Navigate to="/configuracoes?s=whatsapp" replace /></AdminRoute></ProtectedRoute>} />
      <Route path="/meu-whatsapp" element={<ProtectedRoute><React.Suspense fallback={<div />}><MyWhatsApp /></React.Suspense></ProtectedRoute>} />

      {/* Sales/Commercial routes */}
      <Route path="/comercial/cockpit" element={<ProtectedRoute><CockpitShell /></ProtectedRoute>} />
      <Route path="/comercial/meu-dia" element={<Navigate to="/comercial/cockpit" replace />} />
      <Route path="/comercial/agenda" element={<ProtectedRoute><SalesAgenda /></ProtectedRoute>} />
      <Route path="/comercial" element={<ProtectedRoute><SalesDashboard /></ProtectedRoute>} />
      <Route path="/comercial/workspace" element={<ProtectedRoute><SalesWorkspace /></ProtectedRoute>} />
      <Route path="/comercial/leads" element={<ProtectedRoute><SalesLeads /></ProtectedRoute>} />
      <Route path="/comercial/leads/:id" element={<ProtectedRoute><SalesLeadDetail /></ProtectedRoute>} />
      <Route path="/comercial/pipeline" element={<ProtectedRoute><SalesPipeline /></ProtectedRoute>} />
      <Route path="/comercial/deals" element={<ProtectedRoute><SalesDeals /></ProtectedRoute>} />
      <Route path="/comercial/deals/:id" element={<ProtectedRoute><SalesDealDetail /></ProtectedRoute>} />
      <Route path="/comercial/inbox" element={<ProtectedRoute><SalesWhatsAppInbox /></ProtectedRoute>} />
      <Route path="/comercial/relatorios" element={<Navigate to="/comercial?tab=gestao" replace />} />
      <Route path="/comercial/produtos" element={<ProtectedRoute><Products /></ProtectedRoute>} />
      <Route path="/comercial/comissoes" element={<ProtectedRoute><Commissions /></ProtectedRoute>} />
      <Route path="/comercial/playbook" element={<ProtectedRoute><SalesPlaybook /></ProtectedRoute>} />
      <Route path="/comercial/configuracoes" element={<Navigate to="/configuracoes?s=pipeline" replace />} />
      <Route path="/comercial/materiais" element={<ProtectedRoute><SalesMaterialsConfig /></ProtectedRoute>} />
      <Route path="/comercial/treinamento" element={<ProtectedRoute><SalesTraining /></ProtectedRoute>} />
      <Route path="/comercial/agente-ia" element={<Navigate to="/configuracoes?s=agente-ia" replace />} />

      {/* Gestão básica (tarefas, calendário, reuniões) */}
      <Route path="/gestao/tarefas" element={<ProtectedRoute><TaskManagement /></ProtectedRoute>} />
      <Route path="/gestao/calendario" element={<ProtectedRoute><TeamCalendar /></ProtectedRoute>} />
      <Route path="/gestao/reunioes" element={<ProtectedRoute><TeamMeetings /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin/usuarios" element={<ProtectedRoute><AdminRoute><AdminUsers /></AdminRoute></ProtectedRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <ThemeProvider>
  <DemoModeProvider>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CallProvider>
        <MeetingProvider>
          <NotificationProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <NavigationListener />
                <FocusModeProvider>
                  <ErrorBoundary name="Calls"><CallModals /></ErrorBoundary>
                  <ErrorBoundary name="Meeting"><GlobalTranscriptionPanel /><MeetingRecoveryBanner /></ErrorBoundary>
                  <FocusModeOverlay />
                  <RouteErrorBoundary><AppRoutes /></RouteErrorBoundary>
                </FocusModeProvider>
              </BrowserRouter>
            </TooltipProvider>
          </NotificationProvider>
        </MeetingProvider>
      </CallProvider>
    </AuthProvider>
  </QueryClientProvider>
  </DemoModeProvider>
  </ThemeProvider>
);

export default App;
