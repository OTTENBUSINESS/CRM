import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, MessageSquare, Shield, Zap, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignProvider } from '@/types/campaign.types';

interface Props {
  value: CampaignProvider;
  onChange: (provider: CampaignProvider) => void;
}

const OPTIONS: Array<{
  value: CampaignProvider;
  title: string;
  subtitle: string;
  pros: string[];
  cons: string[];
  icon: any;
  accent: string;
}> = [
  {
    value: 'cloud_api',
    title: 'API Oficial (Meta)',
    subtitle: 'Recomendada — sem risco de ban',
    pros: [
      'Envia template aprovado',
      'Funciona com qualquer lead, mesmo frio',
      'Fora da janela de 24h sem problema',
      'Sem risco de banimento',
    ],
    cons: [
      'Só templates aprovados pela Meta',
      'Custa por mensagem ($0.005 a $0.06)',
    ],
    icon: Shield,
    accent: 'emerald',
  },
  {
    value: 'uazapi',
    title: 'API Não Oficial (UAZAPI)',
    subtitle: 'Mais flexível, maior risco',
    pros: [
      'Texto livre — escreve qualquer mensagem',
      'Mídia (imagem, vídeo, áudio)',
      'Sem custo por envio',
    ],
    cons: [
      'Só seguro pra leads na janela de 24h',
      'Risco de banimento da conta',
      'Precisa anti-block (delays, batches)',
    ],
    icon: Zap,
    accent: 'amber',
  },
];

export default function ChannelPicker({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-1">
          Como vamos enviar
        </p>
        <p className="text-sm text-muted-foreground">
          Cada canal tem regras e custos diferentes. Pra primeiro contato, sempre prefira a API Oficial.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {OPTIONS.map((o) => {
          const selected = value === o.value;
          const Icon = o.icon;
          const accentClasses =
            o.accent === 'emerald'
              ? selected
                ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/5'
                : 'hover:border-emerald-300'
              : selected
                ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-500/5'
                : 'hover:border-amber-300';
          return (
            <Card
              key={o.value}
              className={cn(
                'p-5 cursor-pointer transition-all border',
                accentClasses,
              )}
              onClick={() => onChange(o.value)}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    o.accent === 'emerald' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                {selected && <CheckCircle2 className={cn('h-5 w-5', o.accent === 'emerald' ? 'text-emerald-600' : 'text-amber-600')} />}
              </div>

              <h3 className="font-semibold text-base mb-0.5">
                {o.title}
              </h3>
              <p className="text-xs text-muted-foreground mb-3">{o.subtitle}</p>

              <ul className="space-y-1 mb-3">
                {o.pros.map((p, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <ul className="space-y-1">
                {o.cons.map((c, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
