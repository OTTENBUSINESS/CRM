import { useRef, useEffect, useCallback } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "./NotificationBell";
import { MuteNotificationsToggle } from "@/components/inbox/MuteNotificationsToggle";
import { TaskReminderOverlay } from "@/components/tasks/TaskReminderOverlay";
import { TaskAutoLauncher } from "@/components/tasks/TaskAutoLauncher";
import { AITransferAlertOverlay } from "@/components/inbox/AITransferAlertOverlay";
import { WhatsAppDisconnectedAlert } from "@/components/inbox/WhatsAppDisconnectedAlert";
import { InstanceHealthHeaderBadge } from "@/components/inbox/InstanceHealthBanner";
import { FocusBanner } from "./FocusBanner";
import { DailyActivityBanner } from "./DailyActivityBanner";
import { FloatingAgentHost } from "@/agents-platform/components/FloatingAgentHost";
import { useLocation } from "react-router-dom";
import { useCall } from "@/contexts/CallContext";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface AppLayoutProps {
  children: React.ReactNode;
}

const routeTitles: Record<string, string> = {
  "/": "Cockpit CS",
  "/clientes": "Clientes",
  "/onboarding": "Onboarding",
  "/objetivos": "Objetivos",
  "/metricas": "Métricas",
  "/advisor": "Advisor VIP",
  "/configuracoes": "Configurações",
  "/financeiro": "Financeiro",
  "/financeiro/lancamentos": "Lançamentos",
  "/financeiro/dre": "DRE",
  "/financeiro/relatorios": "Relatórios",
  "/financeiro/cobrancas": "Contas a Receber",
};

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const { activeCall } = useCall();
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef(location.pathname);

  // Save scroll of PREVIOUS route before updating pathRef, then restore new route's scroll after render
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (pathRef.current !== location.pathname) {
      // 1. Save previous route's scroll position BEFORE switching
      sessionStorage.setItem(`scroll:${pathRef.current}`, String(el.scrollTop));
      // 2. Update ref to current route
      pathRef.current = location.pathname;
      // 3. Restore scroll AFTER React finishes rendering the new page
      const saved = sessionStorage.getItem(`scroll:${location.pathname}`);
      requestAnimationFrame(() => {
        el.scrollTop = saved ? Number(saved) : 0;
      });
    }
  }, [location.pathname]);

  // Persist scroll position on scroll (throttled to avoid perf issues)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScroll = useCallback(() => {
    if (scrollTimerRef.current) return;
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      const el = scrollRef.current;
      if (el) {
        sessionStorage.setItem(`scroll:${pathRef.current}`, String(el.scrollTop));
      }
    }, 300);
  }, []);

  const getBreadcrumbs = () => {
    const breadcrumbs: { label: string; path: string; isLast: boolean }[] = [];

    if (pathSegments.length === 0) {
      breadcrumbs.push({ label: "Cockpit CS", path: "/", isLast: true });
    } else {
      let currentPath = "";
      pathSegments.forEach((segment, index) => {
        currentPath += `/${segment}`;
        const isLast = index === pathSegments.length - 1;
        const label = routeTitles[currentPath] || segment;
        breadcrumbs.push({ label, path: currentPath, isLast });
      });
    }

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <SidebarProvider>
      {/* Alertas visuais globais */}
      <TaskReminderOverlay />
      <TaskAutoLauncher />
      <AITransferAlertOverlay />
      <div className="min-h-screen flex w-full bg-background overflow-hidden">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {/* Header */}
          <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card sticky top-0 z-10">
            <div className="flex items-center">
              <SidebarTrigger className="mr-4 text-muted-foreground hover:text-foreground" />
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((crumb, index) => (
                    <BreadcrumbItem key={crumb.path + index}>
                      {index > 0 && <BreadcrumbSeparator />}
                      {crumb.isLast ? (
                        <BreadcrumbPage className="text-foreground font-medium">
                          {crumb.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          href={crumb.path}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {crumb.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-2">
              <WhatsAppDisconnectedAlert />
              <InstanceHealthHeaderBadge />
              <MuteNotificationsToggle variant="header" />
              <NotificationBell />
            </div>
          </header>

          {/* Focus Banner */}
          <FocusBanner />

          {/* Daily Activity Banner */}
          <DailyActivityBanner />

          {/* Main Content */}
          <div ref={scrollRef} onScroll={handleScroll} className={`flex-1 p-6 overflow-y-auto overflow-x-hidden${activeCall ? ' pb-20' : ''}`}>{children}</div>
        </main>
      </div>

      {/* Bolha de chat flutuante do agente (canais: floating) */}
      <FloatingAgentHost />
    </SidebarProvider>
  );
}