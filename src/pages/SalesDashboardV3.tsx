import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  Eye, CalendarDays, ChevronLeft, ChevronRight,
  LayoutDashboard, TrendingUp, PhoneCall, Presentation,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import {
  getDateRange,
  type DatePreset,
  type DashboardFilters,
} from '@/hooks/useSalesDashboardV2';
import { DATE_PRESETS, useSessionState } from '@/components/sales/dashboard/shared';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DashboardTabGeral } from '@/components/sales/dashboard/DashboardTabGeral';
import { DashboardTabVendas } from '@/components/sales/dashboard/DashboardTabVendas';
import { DashboardTabPreVendas } from '@/components/sales/dashboard/DashboardTabPreVendas';
import { SalesAIChat } from '@/components/sales/ai/SalesAIChat';

type DashTab = 'geral' | 'vendas' | 'pre-vendas';

export default function SalesDashboardV3() {
  const [searchParams] = useSearchParams();
  const { teamMember } = useAuth();
  const isAdmin = teamMember?.role === 'admin' || teamMember?.role === 'diretor' || teamMember?.role === 'gerente';
  const isCloser = teamMember?.role === 'closer' || teamMember?.role === 'vendedor';

  // Determine default tab based on role
  const defaultTab: DashTab = isCloser ? 'vendas' : 'geral';

  // Persisted state
  const [activeTab, setActiveTab] = useSessionState<DashTab>('dashv3-tab', defaultTab);
  const [datePreset, setDatePreset] = useSessionState<DatePreset>('dashv3-date-preset', 'this_week');
  const [customRangeRaw, setCustomRangeRaw] = useSessionState<{ from: string; to: string } | null>('dashv3-custom-range', null);
  const [selectedRepId, setSelectedRepId] = useSessionState<string | undefined>('dashv3-rep', searchParams.get('rep') || undefined);

  // Demo mode (multiplies values + blur sensitive data)
  const { isDemoMode: demoMode, toggleDemoMode } = useDemoMode();

  // Calendar popover state
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // Custom range serialization
  const customRange = useMemo(() => {
    if (!customRangeRaw) return null;
    return { from: new Date(customRangeRaw.from), to: new Date(customRangeRaw.to) };
  }, [customRangeRaw]);

  const setCustomRange = (v: { from: Date; to: Date } | null) => {
    setCustomRangeRaw(v ? { from: v.from.toISOString(), to: v.to.toISOString() } : null);
  };

  const dateRange = useMemo(() => {
    if (datePreset === 'custom' && customRange) return customRange;
    return getDateRange(datePreset);
  }, [datePreset, customRange]);

  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    setCustomRange(null);
  };

  const handleCalendarMonthSelect = (month: Date) => {
    setCustomRange({ from: startOfMonth(month), to: endOfMonth(month) });
    setDatePreset('custom');
    setCalendarMonth(month);
  };

  // Sales team for selector (admin/comercial only)
  const canSelectRep = isAdmin;

  // Build filters
  const filters: DashboardFilters = useMemo(() => ({
    dateRange,
    salesRepId: selectedRepId || (canSelectRep ? undefined : teamMember?.id),
  }), [dateRange, selectedRepId, canSelectRep, teamMember?.id]);
  const { data: salesTeam } = useQuery({
    queryKey: ['sales-team-members-v3'],
    queryFn: async () => {
      const { data } = await supabase
        .from('team_members')
        .select('id, name, avatar_url')
        .eq('team', 'comercial')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
    enabled: canSelectRep,
  });

  // Effective member id for personal tabs
  const effectiveMemberId = selectedRepId || teamMember?.id || '';

  // Available tabs
  const tabs: { value: DashTab; label: string; icon: React.ReactNode }[] = [
    { value: 'geral', label: 'Geral', icon: <LayoutDashboard className="h-4 w-4" /> },
    { value: 'vendas', label: 'Vendas', icon: <TrendingUp className="h-4 w-4" /> },
    { value: 'pre-vendas', label: 'Pré-Vendas', icon: <PhoneCall className="h-4 w-4" /> },
  ];

  return (
    <AppLayout>
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard Comercial</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {format(dateRange.from, "dd MMM", { locale: ptBR })} — {format(dateRange.to, "dd MMM yyyy", { locale: ptBR })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date presets */}
            <div className="flex items-center bg-muted/70 rounded-xl p-1 gap-0.5 border border-border/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.15)]">
              {DATE_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => handlePresetChange(p.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150',
                    datePreset === p.value
                      ? 'bg-primary text-primary-foreground btn-3d btn-3d-primary shadow-none'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  )}
                >
                  {p.label}
                </button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1 transition-all duration-150',
                    datePreset === 'custom'
                      ? 'bg-primary text-primary-foreground btn-3d btn-3d-primary shadow-none'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  )}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    {datePreset === 'custom' ? format(dateRange.from, "MMM/yy", { locale: ptBR }) : ''}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="end">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-sm font-medium capitalize">{format(calendarMonth, "MMMM yyyy", { locale: ptBR })}</span>
                      <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {Array.from({ length: 6 }, (_, i) => {
                        const m = subMonths(new Date(), i);
                        const isSelected = datePreset === 'custom' && customRange && customRange.from.getTime() === startOfMonth(m).getTime();
                        return (
                          <button
                            key={i}
                            onClick={() => handleCalendarMonthSelect(m)}
                            className={cn(
                              'px-2 py-1.5 rounded-md text-xs font-medium transition-all capitalize',
                              isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {format(m, "MMM/yy", { locale: ptBR })}
                          </button>
                        );
                      })}
                    </div>
                    <CalendarPicker
                      mode="range"
                      month={calendarMonth}
                      onMonthChange={setCalendarMonth}
                      selected={datePreset === 'custom' && customRange ? { from: customRange.from, to: customRange.to } : undefined}
                      onSelect={(range) => {
                        if (range?.from) {
                          setCustomRange({ from: range.from, to: range.to || range.from });
                          setDatePreset('custom');
                        }
                      }}
                      numberOfMonths={1}
                      locale={ptBR}
                      className="rounded-md border"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Rep selector */}
            {canSelectRep && salesTeam && salesTeam.length > 0 && (
              <Select value={selectedRepId || '_all'} onValueChange={(v) => setSelectedRepId(v === '_all' ? undefined : v)}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <Eye className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
                  <SelectValue placeholder="Vendedor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {salesTeam.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Demo mode toggle (admin only) */}
            {isAdmin && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleDemoMode}
                      className={cn(
                        'p-1.5 rounded-md transition-all',
                        demoMode
                          ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      <Presentation className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">{demoMode ? 'Modo demo ativo (×4.5)' : 'Modo demonstração'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DashTab)}>
          <TabsList className="bg-muted/60">
            {tabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs">
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="geral" className="mt-4">
            <DashboardTabGeral filters={filters} dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="vendas" className="mt-4">
            <DashboardTabVendas
              filters={filters}
              teamMemberId={effectiveMemberId}
              dateRange={dateRange}
            />
          </TabsContent>

          <TabsContent value="pre-vendas" className="mt-4">
            <DashboardTabPreVendas
              filters={filters}
              dateRange={dateRange}
              teamMemberId={filters.salesRepId}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* AI Chat */}
      {isAdmin && <SalesAIChat />}
    </AppLayout>
  );
}
