import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Calendar,
  Settings,
  MessageSquare,
  Smartphone,
  ClipboardList,
  CheckSquare,
  BookOpen,
  Video,
  Headphones,
  Kanban,
  LogOut,
  TrendingUp,
  User2,
  ShieldCheck,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useNotificationContext } from "@/hooks/useNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useEnabledModules } from "@/components/settings/sections/ModulesSection";

/* ---------------------------------------------------------------
 * Types & menu data
 * --------------------------------------------------------------- */

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  /** opcional: id do módulo necessário pra exibir */
  moduleId?: string;
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  /** módulo que deve estar ativo pra seção aparecer */
  moduleId?: string;
}

const sections: NavSection[] = [
  {
    id: "comercial",
    label: "Comercial",
    moduleId: "comercial",
    items: [
      { title: "Cockpit", url: "/comercial/cockpit", icon: Headphones },
      { title: "Dashboard", url: "/comercial", icon: LayoutDashboard },
      { title: "Pipeline", url: "/comercial/pipeline", icon: Kanban },
      { title: "Inbox", url: "/comercial/inbox", icon: MessageSquare },
      { title: "Treinamento", url: "/comercial/treinamento", icon: BookOpen },
    ],
  },
  {
    id: "gestao",
    label: "Gestão",
    moduleId: "gestao",
    items: [
      { title: "Tarefas", url: "/gestao/tarefas", icon: CheckSquare },
      { title: "Calendário", url: "/gestao/calendario", icon: Calendar },
      { title: "Reuniões", url: "/gestao/reunioes", icon: Video },
    ],
  },
  {
    id: "pessoal",
    label: "Meu Espaço",
    items: [
      { title: "Meu WhatsApp", url: "/meu-whatsapp", icon: Smartphone },
    ],
  },
];

const bottomItems: NavItem[] = [];

/* ---------------------------------------------------------------
 * AppSidebar
 * --------------------------------------------------------------- */

export function AppSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { unreadWhatsAppCount, markWhatsAppAsRead } = useNotificationContext();
  const { teamMember, signOut, canManageUsers } = useAuth();
  const { isModuleEnabled } = useEnabledModules();

  // Sidebar do shadcn expõe o estado (expanded/collapsed)
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  // Marca inbox como lido ao abrir
  useEffect(() => {
    if (currentPath === "/comercial/inbox") markWhatsAppAsRead();
  }, [currentPath, markWhatsAppAsRead]);

  const isActive = (path: string) => {
    if (path === "/") return currentPath === "/";
    return currentPath === path || currentPath.startsWith(path + "/");
  };

  // Filtra seções conforme módulos ativos
  const visibleSections = useMemo(() => {
    return sections
      .filter((s) => !s.moduleId || isModuleEnabled(s.moduleId))
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => !i.moduleId || isModuleEnabled(i.moduleId)),
      }))
      .filter((s) => s.items.length > 0);
  }, [isModuleEnabled]);

  const userInitials =
    teamMember?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase() || "??";

  return (
    <TooltipProvider delayDuration={200}>
      <Sidebar
        className={cn(
          // borda direita refinada
          "border-r border-sidebar-border/60",
          // fundo com gradiente sutil que dá profundidade
          "bg-[linear-gradient(180deg,hsl(var(--sidebar-background))_0%,hsl(var(--sidebar-background))_60%,hsl(var(--sidebar-background)/0.97)_100%)]"
        )}
      >
        {/* =========================================================
         *  HEADER — Brand
         * ========================================================= */}
        <SidebarHeader
          className={cn(
            "h-16 px-4 flex items-center border-b border-sidebar-border/50",
            isCollapsed && "px-2 justify-center"
          )}
        >
          <NavLink
            to="/comercial"
            aria-label="Ir para o início"
            className="flex items-center gap-3 w-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring rounded-lg"
          >
            {/* Ícone da logo — fundo claro para logo preta ficar visível */}
            <div
              className={cn(
                "relative shrink-0 w-9 h-9 rounded-xl overflow-hidden",
                "bg-[#C9A84C]/15 ring-1 ring-[#C9A84C]/30",
                "flex items-center justify-center",
                "transition-transform duration-300 group-hover:scale-105"
              )}
            >
              <img
                src="/otten-logo.png"
                alt="OTTEN"
                className="w-8 h-8 object-contain"
              />
            </div>

            {!isCollapsed && (
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="text-[13px] font-semibold tracking-tight text-sidebar-accent-foreground truncate">
                  OTTEN CRM
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-muted/80">
                  Painel de Controle
                </span>
              </div>
            )}
          </NavLink>
        </SidebarHeader>

        {/* =========================================================
         *  BODY — Navegação
         * ========================================================= */}
        <SidebarContent
          className={cn(
            "px-3 py-5 gap-6",
            // scroll refinado
            "[&::-webkit-scrollbar]:w-1.5",
            "[&::-webkit-scrollbar-track]:bg-transparent",
            "[&::-webkit-scrollbar-thumb]:bg-sidebar-border/60",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb:hover]:bg-sidebar-border",
            isCollapsed && "px-2"
          )}
        >
          {visibleSections.map((section) => (
            <Section
              key={section.id}
              section={section}
              isCollapsed={isCollapsed}
              isActive={isActive}
              unreadCount={unreadWhatsAppCount}
            />
          ))}

          {/* push para baixo: divisor + settings */}
          <div className="mt-auto flex flex-col gap-1 pt-4 border-t border-sidebar-border/50">
            {!isCollapsed && (
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-muted drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                Sistema
              </p>
            )}
            {canManageUsers && (
              <>
                <NavItemLink
                  item={{ title: "Configurações", url: "/configuracoes", icon: Settings }}
                  active={isActive("/configuracoes")}
                  isCollapsed={isCollapsed}
                />
                <NavItemLink
                  item={{ title: "Usuários", url: "/admin/usuarios", icon: ShieldCheck }}
                  active={isActive("/admin/usuarios")}
                  isCollapsed={isCollapsed}
                />
              </>
            )}
          </div>
        </SidebarContent>

        {/* =========================================================
         *  FOOTER — User
         * ========================================================= */}
        <SidebarFooter
          className={cn(
            "p-3 border-t border-sidebar-border/50",
            isCollapsed && "p-2"
          )}
        >
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  aria-label="Sair"
                  className="w-full flex items-center justify-center h-10 rounded-lg hover:bg-sidebar-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <Avatar className="h-8 w-8 ring-1 ring-sidebar-border">
                    <AvatarFallback className="bg-sidebar-primary/15 text-sidebar-primary text-[11px] font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex flex-col gap-0.5">
                <span className="font-medium">{teamMember?.name || "Usuário"}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {teamMember?.role || ""}
                </span>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="group/user flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-sidebar-accent/40 transition-colors">
              <Avatar className="h-9 w-9 ring-1 ring-sidebar-border shrink-0">
                <AvatarFallback className="bg-sidebar-primary/15 text-sidebar-primary text-[12px] font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>

              <div className="flex flex-col flex-1 min-w-0 leading-tight">
                <span className="text-[13px] font-medium text-sidebar-accent-foreground truncate">
                  {teamMember?.name || "Usuário"}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-muted/80 truncate">
                  {teamMember?.role || "membro"}
                </span>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={signOut}
                    aria-label="Sair da conta"
                    className={cn(
                      "shrink-0 p-2 rounded-lg transition-all",
                      "text-sidebar-muted hover:text-red-400",
                      "hover:bg-red-500/10",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40",
                      "opacity-60 group-hover/user:opacity-100"
                    )}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Sair</TooltipContent>
              </Tooltip>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}

/* ---------------------------------------------------------------
 * Section — grupo com label uppercase + lista de itens
 * --------------------------------------------------------------- */

interface SectionProps {
  section: NavSection;
  isCollapsed: boolean;
  isActive: (path: string) => boolean;
  unreadCount: number;
}

function Section({ section, isCollapsed, isActive, unreadCount }: SectionProps) {
  return (
    <div className="flex flex-col gap-1">
      {!isCollapsed && (
        <div className="flex items-center justify-between px-3 pb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-muted drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
            {section.label}
          </span>
          {/* mini-indicador decorativo */}
          <span className="h-px flex-1 ml-3 bg-gradient-to-r from-sidebar-border/70 to-transparent" />
        </div>
      )}

      <nav aria-label={section.label} className="flex flex-col gap-0.5">
        {section.items.map((item) => {
          const active = isActive(item.url);
          const showBadge = item.url === "/comercial/inbox" && unreadCount > 0;
          return (
            <NavItemLink
              key={item.url}
              item={item}
              active={active}
              isCollapsed={isCollapsed}
              badge={showBadge ? unreadCount : undefined}
            />
          );
        })}
      </nav>
    </div>
  );
}

/* ---------------------------------------------------------------
 * NavItemLink — link individual (com active indicator refinado)
 * --------------------------------------------------------------- */

interface NavItemLinkProps {
  item: NavItem;
  active: boolean;
  isCollapsed: boolean;
  badge?: number;
}

function NavItemLink({ item, active, isCollapsed, badge }: NavItemLinkProps) {
  const Icon = item.icon;

  const content = (
    <NavLink
      to={item.url}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 h-10 rounded-lg text-[13px] font-medium nav-3d",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-0",
        isCollapsed ? "px-0 justify-center w-10 mx-auto" : "px-3",
        active
          ? "text-sidebar-accent-foreground font-semibold nav-3d-active"
          : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
      )}
    >
      {/* Indicador lateral (barra dourada à esquerda) */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all duration-300",
          active
            ? "bg-sidebar-primary opacity-100 scale-y-100 shadow-[0_0_8px_hsl(var(--sidebar-primary)/0.5)]"
            : "bg-sidebar-primary opacity-0 scale-y-50 group-hover:opacity-50 group-hover:scale-y-75"
        )}
      />

      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active
            ? "text-sidebar-primary drop-shadow-[0_0_4px_hsl(var(--sidebar-primary)/0.4)]"
            : "text-sidebar-foreground/85 group-hover:text-sidebar-accent-foreground"
        )}
        strokeWidth={active ? 2.5 : 2}
      />

      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{item.title}</span>
          {badge !== undefined && (
            <Badge
              className={cn(
                "h-5 min-w-[20px] px-1.5 text-[10px] font-semibold tabular-nums",
                "bg-sidebar-primary text-sidebar-primary-foreground border-0",
                "shadow-[0_0_0_0_hsl(var(--sidebar-primary)/0.45)]",
                "animate-[pulse-ring_2.5s_ease-out_infinite]"
              )}
            >
              {badge > 99 ? "99+" : badge}
            </Badge>
          )}
        </>
      )}
    </NavLink>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          <span>{item.title}</span>
          {badge !== undefined && (
            <Badge className="h-4 px-1 text-[10px] bg-sidebar-primary text-sidebar-primary-foreground border-0">
              {badge > 99 ? "99+" : badge}
            </Badge>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}
