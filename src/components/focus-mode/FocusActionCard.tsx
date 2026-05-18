import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Phone, MessageSquare, Calendar, Eye, Building2, Mail, Target,
  Clock, AlertTriangle, SkipForward, CheckCircle2, Video,
  Globe, DollarSign, TrendingUp, Megaphone,
} from 'lucide-react';
import { useCall } from '@/contexts/CallContext';
import { useFocusMode } from '@/contexts/FocusModeContext';
import { useCreateTask, type CreateTaskInput } from '@/hooks/useTasks';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { FocusItem } from '@/hooks/useFocusQueue';
import { supabase } from '@/lib/supabase';
import { cn, ensureHttps } from '@/lib/utils';

const getInitials = (name: string) =>
  name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';

const getScoreColor = (score: number) => {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
};

const getScoreTextColor = (score: number) => {
  if (score >= 70) return 'text-green-500';
  if (score >= 40) return 'text-yellow-500';
  return 'text-red-500';
};

// Schedule form (max 48h)
function ScheduleForm({
  leadId,
  onDone,
}: {
  leadId: string;
  onDone: () => void;
}) {
  const { teamMember } = useAuth();
  const { toast } = useToast();
  const createTask = useCreateTask();
  const [taskType, setTaskType] = useState<'call' | 'whatsapp'>('call');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('10:00');

  const now = new Date();
  const maxDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split('T')[0];
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const handleSchedule = async () => {
    if (!dateStr || !timeStr) {
      toast({ title: 'Selecione data e hora', variant: 'destructive' });
      return;
    }
    const scheduledAt = new Date(`${dateStr}T${timeStr}:00`).toISOString();
    const input: CreateTaskInput = {
      name: taskType === 'call' ? 'Ligar para lead' : 'Enviar WhatsApp',
      task_type: taskType,
      team: 'sales',
      lead_id: leadId,
      responsavel_id: teamMember?.id,
      scheduled_at: scheduledAt,
      priority: 'high',
    };
    try {
      await createTask.mutateAsync(input);
      toast({ title: 'Agendado!', description: `${taskType === 'call' ? 'Ligação' : 'WhatsApp'} agendado.` });
      onDone();
    } catch {
      toast({ title: 'Erro ao agendar', variant: 'destructive' });
    }
  };

  return (
    <div className="flex items-center gap-2 mt-3 p-3 bg-muted/50 rounded-lg">
      <Select value={taskType} onValueChange={(v: any) => setTaskType(v)}>
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="call">Ligação</SelectItem>
          <SelectItem value="whatsapp">WhatsApp</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={dateStr}
        onChange={e => setDateStr(e.target.value)}
        min={todayStr}
        max={maxDateStr}
        className="h-8 text-xs w-[130px]"
      />
      <Input
        type="time"
        value={timeStr}
        onChange={e => setTimeStr(e.target.value)}
        className="h-8 text-xs w-[100px]"
      />
      <Button size="sm" className="h-8 text-xs" onClick={handleSchedule} disabled={createTask.isPending}>
        {createTask.isPending ? '...' : 'Agendar'}
      </Button>
    </div>
  );
}

interface FocusActionCardProps {
  item: FocusItem;
}

export const FocusActionCard = ({ item }: FocusActionCardProps) => {
  const { initiateCall } = useCall();
  const { completeItem, skipItem, showLeadDetail, showInlineChat } = useFocusMode();
  const [showSchedule, setShowSchedule] = useState(false);
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const createTask = useCreateTask();

  const lead = item.type === 'new_lead' ? item.data : item.data?.lead;
  const task = item.type !== 'new_lead' ? item.data?.task : null;
  const phone = lead?.phone;
  const score = item.score || 0;

  const handleCall = () => {
    if (!phone) {
      toast({ title: 'Lead sem telefone', variant: 'destructive' });
      return;
    }
    initiateCall(phone, item.leadId);
    // Call started = overlay will auto-pause via CallContext
  };

  const handleWhatsApp = () => {
    if (!phone) {
      toast({ title: 'Lead sem telefone', variant: 'destructive' });
      return;
    }
    showInlineChat(item.leadId, lead?.name || item.title, phone);
  };

  const handleCompleteTask = async () => {
    if (task) {
      await supabase.from('company_activities').update({
        completed: true,
        completed_at: new Date().toISOString(),
        status: 'completed',
      }).eq('id', task.id);
    }
    completeItem();
  };

  // Meeting Prep view
  if (item.type === 'meeting_prep') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 mb-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-orange-500">Reunião {item.urgency}!</p>
            <p className="text-sm text-muted-foreground">{item.title} - {item.subtitle}</p>
          </div>
          <div className="ml-auto flex gap-2">
            {task?.meeting_link && (
              <Button size="sm" variant="outline" onClick={() => window.open(ensureHttps(task.meeting_link), '_blank')}>
                <Video className="h-4 w-4 mr-1" /> Entrar
              </Button>
            )}
            <Button size="sm" onClick={handleCall}>
              <Phone className="h-4 w-4 mr-1" /> Ligar
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto rounded-xl border bg-background p-4">
          {/* SalesLeadDetailContent will be rendered by the overlay when type=meeting_prep */}
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Button variant="outline" onClick={() => showLeadDetail(item.leadId)}>
              <Eye className="h-4 w-4 mr-2" /> Ver perfil completo do lead
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // New Lead card
  if (item.type === 'new_lead') {
    const bant = {
      budget: lead?.bant_budget,
      authority: lead?.bant_authority,
      need: lead?.bant_need,
      timeline: lead?.bant_timeline,
    };
    const bantCount = Object.values(bant).filter(Boolean).length;
    const monthlyRevenue = item.data?.monthly_revenue;
    const dealTitle = item.data?.deal?.title;
    const salesStage = lead?.sales_stage;

    const STAGE_LABELS: Record<string, string> = {
      captura: 'Captura', qualificacao: 'Qualificação', agendamento: 'Agendamento',
      negociacao: 'Negociação', fechado: 'Fechado', perdido: 'Perdido',
    };

    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl shadow-xl border-2">
          {/* Score bar */}
          <div className={cn('h-1.5 rounded-t-lg', getScoreColor(score))} />
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-start gap-4 mb-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="text-lg bg-orange-500/10 text-orange-600">
                  {getInitials(item.title)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">{item.title}</h2>
                  <Badge className={cn('text-white text-xs', getScoreColor(score))}>
                    {score}
                  </Badge>
                  {salesStage && (
                    <Badge variant="outline" className="text-[10px]">
                      {STAGE_LABELS[salesStage] || salesStage}
                    </Badge>
                  )}
                </div>
                {lead?.company_name && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Building2 className="h-3.5 w-3.5" /> {lead.company_name}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {lead?.email && (
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {lead.email}</span>
                  )}
                  {phone && (
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {phone}</span>
                  )}
                </div>
              </div>
              <Badge variant="outline" className="text-xs flex-shrink-0">
                <Clock className="h-3 w-3 mr-1" /> {item.urgency}
              </Badge>
            </div>

            {/* Deal title if available */}
            {dealTitle && (
              <div className="text-xs text-muted-foreground mb-3 px-1">
                <span className="font-medium">Deal:</span> {dealTitle}
              </div>
            )}

            {/* Info grid: Faturamento + BANT */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Faturamento */}
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <DollarSign className="h-3.5 w-3.5" /> Faturamento
                </div>
                <p className="text-sm font-semibold">
                  {monthlyRevenue || 'Não informado'}
                </p>
              </div>

              {/* BANT */}
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Target className="h-3.5 w-3.5" /> BANT ({bantCount}/4)
                </div>
                <div className="flex items-center gap-1.5">
                  {([
                    { key: 'budget' as const, label: 'B' },
                    { key: 'authority' as const, label: 'A' },
                    { key: 'need' as const, label: 'N' },
                    { key: 'timeline' as const, label: 'T' },
                  ]).map(({ key, label }) => (
                    <Badge
                      key={key}
                      variant={bant[key] ? 'default' : 'outline'}
                      className={cn(
                        'text-[10px] px-1.5 h-5',
                        bant[key] && 'bg-green-600 text-white'
                      )}
                    >
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* UTMs */}
            {(lead?.utm_source || lead?.utm_campaign || lead?.utm_medium) && (
              <div className="bg-muted/50 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <Globe className="h-3.5 w-3.5" /> Origem / UTMs
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {lead.utm_source && (
                    <span><span className="text-muted-foreground">Source:</span> <b>{lead.utm_source}</b></span>
                  )}
                  {lead.utm_medium && (
                    <span><span className="text-muted-foreground">Medium:</span> <b>{lead.utm_medium}</b></span>
                  )}
                  {lead.utm_campaign && (
                    <span><span className="text-muted-foreground">Campaign:</span> <b>{lead.utm_campaign}</b></span>
                  )}
                  {lead.utm_content && (
                    <span><span className="text-muted-foreground">Content:</span> <b>{lead.utm_content}</b></span>
                  )}
                  {lead.utm_term && (
                    <span><span className="text-muted-foreground">Term:</span> <b>{lead.utm_term}</b></span>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                className="flex-1 h-12 text-sm bg-green-600 hover:bg-green-700"
                onClick={handleCall}
                disabled={!phone}
              >
                <Phone className="h-4 w-4 mr-2" />
                Ligar
              </Button>
              <Button
                className="flex-1 h-12 text-sm"
                variant="outline"
                onClick={handleWhatsApp}
                disabled={!phone}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
              <Button
                className="flex-1 h-12 text-sm"
                variant="outline"
                onClick={() => setShowSchedule(!showSchedule)}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Agendar
              </Button>
            </div>

            {showSchedule && (
              <ScheduleForm
                leadId={item.leadId}
                onDone={() => {
                  setShowSchedule(false);
                  completeItem();
                }}
              />
            )}

            {/* Secondary actions */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => showLeadDetail(item.leadId)}
              >
                <Eye className="h-3.5 w-3.5 mr-1" /> Ver detalhes completos
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={skipItem}
              >
                <SkipForward className="h-3.5 w-3.5 mr-1" /> Pular
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Overdue Task card
  return (
    <div className="h-full flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl shadow-xl border-2 border-red-500/20">
        <div className="h-1.5 rounded-t-lg bg-red-500" />
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <div className="h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <div className="flex-1">
              <Badge variant="outline" className="text-red-500 border-red-500/30 text-[10px] mb-1">
                Tarefa Atrasada
              </Badge>
              <h2 className="text-xl font-bold">{item.title}</h2>
              {item.subtitle && (
                <p className="text-sm text-muted-foreground">{item.subtitle}</p>
              )}
            </div>
            <Badge variant="outline" className="text-xs text-red-500 border-red-500/30">
              <Clock className="h-3 w-3 mr-1" /> {item.urgency}
            </Badge>
          </div>

          {/* Task info */}
          {task && (
            <div className="bg-muted/50 rounded-lg p-3 mb-5 text-sm">
              {task.description && <p className="text-muted-foreground mb-1">{task.description}</p>}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Tipo: <b>{task.task_type}</b></span>
                {task.priority && <span>Prioridade: <b>{task.priority}</b></span>}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              className="flex-1 h-12 text-sm"
              onClick={task?.task_type === 'whatsapp' ? handleWhatsApp : handleCall}
              disabled={!phone}
            >
              {task?.task_type === 'whatsapp' ? (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" /> Enviar WhatsApp
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4 mr-2" /> Ligar
                </>
              )}
            </Button>
            <Button
              className="flex-1 h-12 text-sm"
              variant="outline"
              onClick={() => setShowSchedule(!showSchedule)}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Reagendar
            </Button>
            <Button
              className="flex-1 h-12 text-sm bg-green-600 hover:bg-green-700 text-white"
              onClick={handleCompleteTask}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Concluir
            </Button>
          </div>

          {showSchedule && (
            <ScheduleForm
              leadId={item.leadId}
              onDone={() => {
                setShowSchedule(false);
                completeItem();
              }}
            />
          )}

          {/* Secondary actions */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t">
            {item.leadId && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => showLeadDetail(item.leadId)}
              >
                <Eye className="h-3.5 w-3.5 mr-1" /> Ver lead
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground ml-auto"
              onClick={skipItem}
            >
              <SkipForward className="h-3.5 w-3.5 mr-1" /> Pular
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
