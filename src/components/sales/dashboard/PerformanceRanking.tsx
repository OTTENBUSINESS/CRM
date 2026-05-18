import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Flame, UserCheck, TrendingUp, MessageSquare, Trophy, Medal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SalesPerformanceRow } from '@/hooks/useSalesPerformance';

type RankingTab = 'streak' | 'noshow' | 'deals' | 'followups';

const TABS: { key: RankingTab; label: string; icon: typeof Flame; color: string }[] = [
  { key: 'streak', label: 'Streak', icon: Flame, color: 'text-orange-500' },
  { key: 'noshow', label: 'No-show', icon: UserCheck, color: 'text-emerald-500' },
  { key: 'deals', label: 'Deals', icon: TrendingUp, color: 'text-indigo-500' },
  { key: 'followups', label: 'Follow-ups', icon: MessageSquare, color: 'text-blue-500' },
];

function getPositionBadge(pos: number) {
  if (pos === 0) return <Trophy className="h-4 w-4 text-amber-500" />;
  if (pos === 1) return <Medal className="h-4 w-4 text-slate-400" />;
  if (pos === 2) return <Medal className="h-4 w-4 text-amber-700" />;
  return <span className="text-[10px] font-bold text-muted-foreground w-4 text-center">{pos + 1}</span>;
}

function sortData(data: SalesPerformanceRow[], tab: RankingTab): SalesPerformanceRow[] {
  const sorted = [...data];
  switch (tab) {
    case 'streak':
      return sorted.sort((a, b) => b.streak_days - a.streak_days);
    case 'noshow':
      return sorted.sort((a, b) => a.noshow_rate - b.noshow_rate);
    case 'deals':
      return sorted.sort((a, b) => b.deals_moved - a.deals_moved);
    case 'followups':
      return sorted.sort((a, b) => b.followups_done - a.followups_done);
  }
}

function getValue(row: SalesPerformanceRow, tab: RankingTab): string {
  switch (tab) {
    case 'streak':
      return `${row.streak_days}d`;
    case 'noshow':
      return `${row.noshow_rate}%`;
    case 'deals':
      return `${row.deals_moved}`;
    case 'followups':
      return `${row.followups_done}`;
  }
}

function getMaxValue(data: SalesPerformanceRow[], tab: RankingTab): number {
  if (data.length === 0) return 1;
  switch (tab) {
    case 'streak':
      return Math.max(...data.map(d => d.streak_days), 1);
    case 'noshow':
      return 100;
    case 'deals':
      return Math.max(...data.map(d => d.deals_moved), 1);
    case 'followups':
      return Math.max(...data.map(d => d.followups_done), 1);
  }
}

function getBarPercent(row: SalesPerformanceRow, tab: RankingTab, max: number): number {
  switch (tab) {
    case 'streak':
      return max > 0 ? (row.streak_days / max) * 100 : 0;
    case 'noshow':
      // Invert: lower no-show = longer bar
      return 100 - row.noshow_rate;
    case 'deals':
      return max > 0 ? (row.deals_moved / max) * 100 : 0;
    case 'followups':
      return max > 0 ? (row.followups_done / max) * 100 : 0;
  }
}

const BAR_COLORS: Record<RankingTab, string> = {
  streak: 'bg-orange-400 dark:bg-orange-500',
  noshow: 'bg-emerald-400 dark:bg-emerald-500',
  deals: 'bg-indigo-400 dark:bg-indigo-500',
  followups: 'bg-blue-400 dark:bg-blue-500',
};

interface Props {
  data: SalesPerformanceRow[] | undefined;
  isLoading: boolean;
  onSelectRep?: (repId: string) => void;
}

export function PerformanceRanking({ data, isLoading, onSelectRep }: Props) {
  const [activeTab, setActiveTab] = useState<RankingTab>('streak');

  const sorted = data ? sortData(data, activeTab) : [];
  const max = data ? getMaxValue(data, activeTab) : 1;

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Ranking Operacional
          </CardTitle>
        </div>
        <div className="flex gap-1 mt-2">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all',
                  activeTab === tab.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
              >
                <Icon className={cn('h-3 w-3', activeTab === tab.key ? tab.color : '')} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {isLoading ? (
          <div className="space-y-2.5 mt-1">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
          </div>
        ) : sorted.length > 0 ? (
          <div className="space-y-1.5 mt-1">
            {sorted.map((row, i) => (
              <div
                key={row.sales_rep_id}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-all',
                  i === 0 && 'bg-amber-50/60 dark:bg-amber-950/20',
                  onSelectRep && 'cursor-pointer hover:bg-muted/40'
                )}
                onClick={() => onSelectRep?.(row.sales_rep_id)}
              >
                <div className="w-5 flex items-center justify-center shrink-0">
                  {getPositionBadge(i)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-medium truncate">{row.sales_rep_name}</span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] h-4 px-1.5 shrink-0 ml-2"
                    >
                      {getValue(row, activeTab)}
                    </Badge>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', BAR_COLORS[activeTab])}
                      style={{ width: `${Math.max(getBarPercent(row, activeTab, max), 3)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">
            Sem dados
          </div>
        )}
      </CardContent>
    </Card>
  );
}
