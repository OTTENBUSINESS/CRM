import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Pause, Play, XCircle, Send, CheckCheck, Eye, MessageSquareReply,
  AlertTriangle, Ban, Clock, MessageSquare, Users, Shield, UserCheck,
  ChevronDown, ChevronUp, Rocket, FileText, Wifi, WifiOff, ShieldAlert,
  QrCode, Loader2, RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { Campaign } from '@/types/campaign.types';
import { ASSIGNMENT_MODE_LABELS } from '@/types/campaign.types';
import { usePauseCampaign, useResumeCampaign, useCancelCampaign, useStartCampaign, usePipelineStages, useWhatsAppInstances, useCampaignInstanceStats } from '@/hooks/useCampaigns';
import { useWhatsAppTemplates } from '@/hooks/useWhatsAppTemplates';
import CampaignStatusBadge from './CampaignStatusBadge';
import CampaignProgressBar from './CampaignProgressBar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

interface Props {
  campaign: Campaign;
}

export default function CampaignDetailPanel({ campaign }: Props) {
  const { toast } = useToast();
  const pauseCampaign = usePauseCampaign();
  const resumeCampaign = useResumeCampaign();
  const cancelCampaign = useCancelCampaign();
  const startCampaign = useStartCampaign();
  const { data: pipelineStages = [] } = usePipelineStages();
  const { data: instances = [] } = useWhatsAppInstances();

  const { data: instanceStats = [] } = useCampaignInstanceStats(campaign.instance_ids || []);
  const queryClient = useQueryClient();

  const [showMessages, setShowMessages] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null);

  // Alertas de instâncias
  const blockedInstances = instanceStats.filter(i => i.health === 'blocked' || i.health === 'cooldown');
  const disconnectedInstances = instanceStats.filter(i => i.health === 'disconnected');
  const hasInstanceAlerts = blockedInstances.length > 0 || disconnectedInstances.length > 0;

  const handleGenerateQR = useCallback(async (inst: { instanceId: string; name: string; apiKey?: string; apiUrl?: string }) => {
    const url = inst.apiUrl;
    if (!url || !inst.apiKey) {
      toast({ title: 'Instância sem API configurada', variant: 'destructive' });
      return;
    }
    setQrLoadingId(inst.instanceId);
    setQrMap(prev => ({ ...prev, [inst.instanceId]: '' }));
    try {
      await fetch(`${url}/instance/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: inst.apiKey },
        body: JSON.stringify({}),
      });
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`${url}/instance/status`, {
        headers: { token: inst.apiKey },
      });
      const statusData = await statusRes.json();
      const qr = statusData.instance?.qrcode || statusData.qrcode;
      if (qr) {
        setQrMap(prev => ({ ...prev, [inst.instanceId]: qr }));
        toast({ title: `QR Code gerado para ${inst.name}` });
      } else if (statusData.instance?.status === 'open' || statusData.status === 'open') {
        toast({ title: `${inst.name} já está conectada!` });
        setQrMap(prev => { const n = { ...prev }; delete n[inst.instanceId]; return n; });
        queryClient.invalidateQueries({ queryKey: ['campaign-instance-stats'] });
      } else {
        toast({ title: 'QR Code não disponível, tente novamente', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro ao gerar QR Code', variant: 'destructive' });
    } finally {
      setQrLoadingId(null);
    }
  }, [toast, queryClient]);

  const handlePause = async () => {
    try {
      await pauseCampaign.mutateAsync({ campaignId: campaign.id });
      toast({ title: 'Campanha pausada' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleResume = async () => {
    try {
      await resumeCampaign.mutateAsync(campaign.id);
      toast({ title: 'Campanha retomada' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancelar esta campanha? Leads pendentes não serão enviados.')) return;
    try {
      await cancelCampaign.mutateAsync(campaign.id);
      toast({ title: 'Campanha cancelada' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleStart = async () => {
    if (!confirm(`Disparar campanha "${campaign.name}" agora?`)) return;
    setIsStarting(true);
    try {
      await startCampaign.mutateAsync(campaign.id);
      toast({ title: 'Campanha iniciada!' });
    } catch (err: any) {
      toast({ title: 'Erro ao iniciar', description: err.message, variant: 'destructive' });
    } finally {
      setIsStarting(false);
    }
  };

  const responseRate = campaign.sent_count > 0
    ? Math.round((campaign.responded_count / campaign.sent_count) * 100)
    : 0;

  // Resolve names
  const isCloudApi = (campaign as any).provider === 'cloud_api';
  const messages = campaign.message_contents?.length ? campaign.message_contents : (campaign.message_content ? [campaign.message_content] : []);
  const filters = campaign.audience_filters as Record<string, any> || {};
  const leadIds = (filters.lead_ids as string[]) || [];
  const isSpecificLeads = leadIds.length > 0;

  // Pra Cloud API: busca o template selecionado
  const { data: cloudTemplates = [] } = useWhatsAppTemplates();
  const cloudTpl = isCloudApi
    ? cloudTemplates.find((t: any) => t.id === (campaign as any).cloud_template_id)
    : null;
  const cloudTplBody = cloudTpl
    ? ((cloudTpl.components || []).find((c: any) => c.type === 'BODY')?.text || '')
    : '';

  const [showLeadList, setShowLeadList] = useState(false);
  const { data: specificLeads = [] } = useQuery({
    queryKey: ['campaign-specific-leads', campaign.id, leadIds.length],
    enabled: isSpecificLeads && showLeadList,
    queryFn: async () => {
      if (leadIds.length === 0) return [];
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, phone, email, city_name, state')
        .in('id', leadIds);
      if (error) throw error;
      return data || [];
    },
  });

  const stageNames = (filters.pipeline_stage_ids || []).map((id: string) => {
    const stage = pipelineStages.find((s: any) => s.id === id);
    return stage ? (stage as any).name : id.slice(0, 8);
  });

  const instanceNames = (campaign.instance_ids || []).map((id: string) => {
    const inst = instances.find((i: any) => i.id === id);
    return inst ? (inst as any).name : id.slice(0, 8);
  });

  const isDraft = campaign.status === 'draft';
  const isScheduled = campaign.status === 'scheduled';
  const hasSentData = campaign.sent_count > 0 || campaign.status === 'sending' || campaign.status === 'completed';

  const metrics = [
    { label: 'Enviados', value: campaign.sent_count, icon: Send, color: 'text-sky-500' },
    { label: 'Entregues', value: campaign.delivered_count, icon: CheckCheck, color: 'text-teal-500' },
    { label: 'Lidos', value: campaign.read_count, icon: Eye, color: 'text-indigo-500' },
    { label: 'Responderam', value: campaign.responded_count, icon: MessageSquareReply, color: 'text-green-500' },
    { label: 'Falharam', value: campaign.failed_count, icon: AlertTriangle, color: 'text-amber-500' },
    { label: 'Bloqueados', value: campaign.blocked_count, icon: Ban, color: 'text-red-500' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{campaign.name}</h2>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          {campaign.description && (
            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{campaign.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <Button size="sm" onClick={handleStart} disabled={isStarting}>
              {isStarting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1" />
              ) : (
                <Rocket className="h-4 w-4 mr-1" />
              )}
              Disparar Agora
            </Button>
          )}
          {campaign.status === 'sending' && (
            <Button variant="outline" size="sm" onClick={handlePause} disabled={pauseCampaign.isPending}>
              <Pause className="h-4 w-4 mr-1" />
              Pausar
            </Button>
          )}
          {campaign.status === 'paused' && (
            <Button variant="default" size="sm" onClick={handleResume} disabled={resumeCampaign.isPending}>
              <Play className="h-4 w-4 mr-1" />
              Retomar
            </Button>
          )}
          {(campaign.status === 'sending' || campaign.status === 'paused') && (
            <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelCampaign.isPending}>
              <XCircle className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Pause alert */}
      {campaign.status === 'paused' && campaign.pause_reason && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{campaign.pause_reason}</AlertDescription>
        </Alert>
      )}

      {/* Instance health alerts */}
      {hasInstanceAlerts && (campaign.status === 'sending' || campaign.status === 'paused') && (
        <div className="space-y-2">
          {disconnectedInstances.length > 0 && (
            <div className="space-y-2">
              {disconnectedInstances.map(inst => {
                const qr = qrMap[inst.instanceId];
                const isLoading = qrLoadingId === inst.instanceId;
                return (
                  <Alert key={inst.instanceId} className="border-orange-300 bg-orange-50 dark:bg-orange-950/30">
                    <WifiOff className="h-4 w-4 text-orange-600" />
                    <AlertDescription className="text-orange-800 dark:text-orange-300">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-medium">Instância desconectada: </span>
                          {inst.name}
                          <span className="text-xs ml-1 opacity-70">({inst.phone})</span>
                          <p className="text-xs mt-0.5 opacity-80">Escaneie o QR Code para reconectar. Enquanto isso, as demais instâncias continuam enviando.</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-orange-400 text-orange-700 hover:bg-orange-100"
                          onClick={() => handleGenerateQR(inst)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : qr ? (
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          ) : (
                            <QrCode className="h-3.5 w-3.5 mr-1" />
                          )}
                          {qr ? 'Novo QR' : 'Reconectar'}
                        </Button>
                      </div>
                      {qr && (
                        <div className="mt-3 flex flex-col items-center">
                          <img
                            src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                            alt="QR Code WhatsApp"
                            className="w-48 h-48 rounded-lg border-2 border-orange-200"
                          />
                          <p className="text-xs mt-2 opacity-70">Abra o WhatsApp no celular → Aparelhos conectados → Conectar</p>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                );
              })}
            </div>
          )}
          {blockedInstances.length > 0 && (
            <Alert className="border-red-300 bg-red-50 dark:bg-red-950/30">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-300">
                <span className="font-medium">Instância em cooldown: </span>
                {blockedInstances.map(i => {
                  const until = i.cooldownUntil ? new Date(i.cooldownUntil).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                  return `${i.name}${until ? ` (até ${until})` : ''}`;
                }).join(', ')}
                {' — '}Bloqueio detectado, instância pausada por 24h.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Progress */}
      {(campaign.status === 'sending' || campaign.status === 'paused') && (
        <CampaignProgressBar campaign={campaign} />
      )}

      {/* Metrics grid — only if has sent data */}
      {hasSentData && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {metrics.map(m => (
            <Card key={m.label}>
              <CardContent className="p-3 text-center">
                <m.icon className={cn('h-4 w-4 mx-auto mb-1', m.color)} />
                <p className="text-lg font-bold">{m.value}</p>
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Messages */}
      <Card>
        <CardHeader className="py-3 px-4">
          <button
            onClick={() => setShowMessages(!showMessages)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {isCloudApi ? 'Template Meta' : 'Mensagens'}
              {!isCloudApi && messages.length > 0 && (
                <Badge variant="secondary" className="text-xs">{messages.length} variação{messages.length > 1 ? 'ões' : ''}</Badge>
              )}
              {isCloudApi && (
                <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700 border-emerald-200">
                  API Oficial
                </Badge>
              )}
            </CardTitle>
            {showMessages ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {showMessages && (
          <CardContent className="px-4 pb-4 space-y-3">
            {isCloudApi ? (
              cloudTpl ? (
                <div className="bg-muted/50 rounded-lg p-3 border space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700 border-emerald-200">
                      <CheckCheck className="h-2.5 w-2.5" /> APPROVED
                    </Badge>
                    <span className="text-sm font-medium">{cloudTpl.name}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {cloudTpl.category} · {cloudTpl.language}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-line leading-relaxed bg-white border rounded-md p-3">
                    {cloudTplBody || '(corpo vazio)'}
                  </p>
                  {(campaign as any).cloud_template_params?.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Variáveis: {(campaign as any).cloud_template_params
                        .sort((a: any, b: any) => a.index - b.index)
                        .map((p: any) => `{{${p.index}}}=${p.type === 'lead_field' ? `@${p.value}` : `"${p.value}"`}`)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Template não encontrado (pode ter sido removido).</p>
              )
            ) : messages.length > 0 ? (
              messages.map((msg, idx) => (
                <div key={idx} className="bg-muted/50 rounded-lg p-3 border">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">Msg {idx + 1}</Badge>
                  </div>
                  <p className="text-sm whitespace-pre-line leading-relaxed">{msg}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic">Sem mensagem configurada.</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Audience + Config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Audience filters */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Audiência
                <Badge variant="outline" className="text-[10px]">
                  {campaign.total_leads.toLocaleString('pt-BR')}
                </Badge>
              </span>
              {isSpecificLeads && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowLeadList(true)}
                >
                  Ver leads
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2 text-sm">
            {isSpecificLeads && (
              <div className="text-xs flex items-center gap-2 text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" />
                {leadIds.length} lead{leadIds.length === 1 ? '' : 's'} selecionado{leadIds.length === 1 ? '' : 's'} manualmente
              </div>
            )}
            {stageNames.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Etapas do Pipeline</p>
                <div className="flex flex-wrap gap-1">
                  {stageNames.map((name: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{name}</Badge>
                  ))}
                </div>
              </div>
            )}
            {(filters.created_after || filters.created_before) && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Período de Criação</p>
                <p className="text-sm">
                  {filters.created_after ? new Date(filters.created_after).toLocaleDateString('pt-BR') : '—'}
                  {' até '}
                  {filters.created_before ? new Date(filters.created_before).toLocaleDateString('pt-BR') : '—'}
                </p>
              </div>
            )}
            {filters.sales_stages?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Estágios de Venda</p>
                <div className="flex flex-wrap gap-1">
                  {filters.sales_stages.map((s: string) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {(filters.capital_min || filters.capital_max) && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Capital</p>
                <p className="text-sm">
                  {filters.capital_min ? `R$ ${Number(filters.capital_min).toLocaleString('pt-BR')}` : '—'}
                  {' até '}
                  {filters.capital_max ? `R$ ${Number(filters.capital_max).toLocaleString('pt-BR')}` : '—'}
                </p>
              </div>
            )}
            {(filters.cities?.length > 0 || filters.states?.length > 0) && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Localização</p>
                <div className="flex flex-wrap gap-1">
                  {(filters.states || []).map((s: string) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                  {(filters.cities || []).map((c: string) => (
                    <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                </div>
              </div>
            )}
            {filters.exclude_lead_ids?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {filters.exclude_lead_ids.length} lead{filters.exclude_lead_ids.length > 1 ? 's' : ''} excluído{filters.exclude_lead_ids.length > 1 ? 's' : ''}
              </p>
            )}
            {Object.keys(filters).length === 0 && (
              <p className="text-xs text-muted-foreground">Sem filtros definidos</p>
            )}
          </CardContent>
        </Card>

        {/* Send config */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Configuração de Envio
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Horário Comercial</p>
                <p className="font-medium">{campaign.business_hours_start?.slice(0, 5)} — {campaign.business_hours_end?.slice(0, 5)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Instâncias</p>
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {instanceStats.length > 0 ? instanceStats.map((inst) => (
                    <Badge
                      key={inst.instanceId}
                      variant="outline"
                      className={cn('text-xs gap-1', {
                        'border-green-400 text-green-700 dark:text-green-400': inst.health === 'ok',
                        'border-orange-400 text-orange-700 dark:text-orange-400': inst.health === 'disconnected',
                        'border-red-400 text-red-700 dark:text-red-400': inst.health === 'cooldown' || inst.health === 'blocked',
                      })}
                    >
                      {inst.health === 'ok' && <Wifi className="h-3 w-3" />}
                      {inst.health === 'disconnected' && <WifiOff className="h-3 w-3" />}
                      {(inst.health === 'cooldown' || inst.health === 'blocked') && <ShieldAlert className="h-3 w-3" />}
                      {inst.name}
                      {inst.health === 'ok' && <span className="text-muted-foreground ml-0.5">({inst.messagesSentDay})</span>}
                    </Badge>
                  )) : instanceNames.length > 0 ? instanceNames.map((name: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">{name}</Badge>
                  )) : <span className="text-muted-foreground text-xs">Nenhuma</span>}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Delay entre msgs</p>
                <p className="font-medium">{campaign.delay_min_seconds}s — {campaign.delay_max_seconds}s</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Batch</p>
                <p className="font-medium">{campaign.batch_size} leads, pausa {campaign.batch_pause_min_seconds}—{campaign.batch_pause_max_seconds}s</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Limite/h por instância</p>
                <p className="font-medium">{campaign.hourly_limit_per_instance}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Limite/dia por instância</p>
                <p className="font-medium">{campaign.daily_limit_per_instance}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary info */}
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Total Leads</p>
            <p className="font-medium">{campaign.total_leads || '—'}</p>
          </div>
          {hasSentData && (
            <div>
              <p className="text-muted-foreground text-xs">Taxa de Resposta</p>
              <p className="font-medium">{responseRate}%</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">Atribuição</p>
            <p className="font-medium">{ASSIGNMENT_MODE_LABELS[campaign.assignment_mode] || campaign.assignment_mode}</p>
          </div>
          {campaign.scheduled_at && (
            <div>
              <p className="text-muted-foreground text-xs">Agendada para</p>
              <p className="font-medium">{new Date(campaign.scheduled_at).toLocaleString('pt-BR')}</p>
            </div>
          )}
          {campaign.started_at && (
            <div>
              <p className="text-muted-foreground text-xs">Iniciada em</p>
              <p className="font-medium">{new Date(campaign.started_at).toLocaleString('pt-BR')}</p>
            </div>
          )}
          {campaign.completed_at && (
            <div>
              <p className="text-muted-foreground text-xs">Concluída em</p>
              <p className="font-medium">{new Date(campaign.completed_at).toLocaleString('pt-BR')}</p>
            </div>
          )}
          {campaign.created_by_member?.name && (
            <div>
              <p className="text-muted-foreground text-xs">Criada por</p>
              <p className="font-medium">{campaign.created_by_member.name}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">Criada em</p>
            <p className="font-medium">{new Date(campaign.created_at).toLocaleString('pt-BR')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Modal: lista de leads específicos */}
      <Dialog open={showLeadList} onOpenChange={setShowLeadList}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Leads desta campanha
            </DialogTitle>
            <DialogDescription>
              {leadIds.length} lead{leadIds.length === 1 ? '' : 's'} selecionado{leadIds.length === 1 ? '' : 's'} manualmente.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1.5">
              {specificLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Carregando…</p>
              ) : (
                specificLeads.map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md border hover:bg-accent/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{l.name || '(sem nome)'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {l.phone || '—'}
                        {l.email && <span className="ml-2">· {l.email}</span>}
                        {(l.city_name || l.state) && <span className="ml-2">· {l.city_name || l.state}</span>}
                      </p>
                    </div>
                    <a
                      href={`/comercial/leads/${l.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#917D3D] hover:underline shrink-0"
                    >
                      Abrir lead
                    </a>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
