import React, { useState, lazy, Suspense, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { cn } from '@/lib/utils';
import { Kanban, CalendarDays, Crosshair, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const CockpitTabPipeline = lazy(() => import('@/components/cockpit/CockpitTabPipeline').then(m => ({ default: m.CockpitTabPipeline })));
const CockpitTabAgenda = lazy(() => import('@/components/cockpit/CockpitTabAgenda').then(m => ({ default: m.CockpitTabAgenda })));
const CockpitTabExecucao = lazy(() => import('@/components/cockpit/CockpitTabExecucao').then(m => ({ default: m.CockpitTabExecucao })));

type CockpitTab = 'agenda' | 'pipeline' | 'execucao';

const TABS: { key: CockpitTab; label: string; icon: React.ElementType }[] = [
  { key: 'agenda', label: 'Agenda', icon: CalendarDays },
  { key: 'pipeline', label: 'Pipeline', icon: Kanban },
  { key: 'execucao', label: 'Execução', icon: Crosshair },
];

function TabBar({ activeTab, onTabChange, dark }: { activeTab: CockpitTab; onTabChange: (t: CockpitTab) => void; dark?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1 px-4 py-2 border-b shrink-0",
      dark ? "bg-zinc-900 border-zinc-800" : "bg-background",
    )}>
      {TABS.map(tab => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              dark
                ? active ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                : active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

const Loading = () => (
  <div className="flex items-center justify-center h-96 text-muted-foreground">
    <div className="animate-pulse">Carregando...</div>
  </div>
);

class TabErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-lg text-center space-y-4">
            <p className="text-red-500 font-semibold text-lg">Erro ao carregar aba</p>
            <pre className="text-xs text-left bg-red-950/20 border border-red-900/30 rounded-lg p-4 overflow-auto max-h-60 text-red-400">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
            <button
              className="px-4 py-2 bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-600"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset?.();
              }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CockpitShell() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get('tab') as CockpitTab | null;
  const [activeTab, setActiveTab] = useState<CockpitTab>(tabParam && TABS.some(t => t.key === tabParam) ? tabParam : 'agenda');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [pendingTab, setPendingTab] = useState<CockpitTab | 'back' | null>(null);

  const handleTabChange = useCallback((tab: CockpitTab) => {
    // If leaving execucao, ask for confirmation
    if (activeTab === 'execucao' && tab !== 'execucao') {
      setPendingTab(tab);
      setShowExitConfirm(true);
      return;
    }
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  }, [activeTab, setSearchParams]);

  const handleExitFocus = useCallback(() => {
    setShowExitConfirm(false);
    if (pendingTab === 'back') {
      navigate(-1);
    } else if (pendingTab) {
      setActiveTab(pendingTab);
      setSearchParams({ tab: pendingTab }, { replace: true });
    }
    setPendingTab(null);
  }, [pendingTab, navigate, setSearchParams]);

  const handleBackClick = useCallback(() => {
    if (activeTab === 'execucao') {
      setPendingTab('back');
      setShowExitConfirm(true);
    } else {
      navigate(-1);
    }
  }, [activeTab, navigate]);

  const isExecucao = activeTab === 'execucao';

  // Execução fullscreen overlay rendered via portal (keeps AppLayout tree stable — Lesson #046)
  const fullscreenOverlay = isExecucao ? createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Top bar with back button */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackClick}
          className="text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Sair do Modo Foco
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        <TabErrorBoundary onReset={() => setActiveTab('agenda')}>
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center text-zinc-400 animate-pulse">
              Carregando...
            </div>
          }>
            <CockpitTabExecucao />
          </Suspense>
        </TabErrorBoundary>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <AppLayout>
      <div
        className="-m-6 flex flex-col"
        style={{ height: 'calc(100vh - 3.5rem)' }}
      >
        <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Tab content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <TabErrorBoundary onReset={() => handleTabChange(activeTab)}>
            <Suspense fallback={<Loading />}>
              {activeTab === 'agenda' && <CockpitTabAgenda />}
              {activeTab === 'pipeline' && <CockpitTabPipeline />}
              {/* Execucao content is in the portal overlay, but we keep this placeholder
                  to avoid React tree changes when switching tabs */}
              {activeTab === 'execucao' && <div className="flex-1" />}
            </Suspense>
          </TabErrorBoundary>
        </div>
      </div>

      {/* Fullscreen portal for execucao */}
      {fullscreenOverlay}

      {/* Exit confirmation dialog */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair do Modo Foco?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja sair do modo de execução? Seu progresso na fila será mantido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowExitConfirm(false); setPendingTab(null); }}>
              Continuar focado
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleExitFocus}>
              Sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
