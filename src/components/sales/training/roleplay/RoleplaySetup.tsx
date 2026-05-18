import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Mic,
  User,
  Briefcase,
  Building2,
  ChevronRight,
  Pencil,
  Zap,
  Clock,
  Brain,
  DollarSign,
  ShieldQuestion,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_PERSONAS, type RoleplayPersona, type CustomPersona } from '@/hooks/useRoleplaySession';

interface RoleplaySetupProps {
  onStart: (personaOrCustom: string | CustomPersona, scenario: string, voice: string) => void;
  isConnecting: boolean;
}

const voices = [
  { id: 'ash', label: 'Ash', gender: 'Masculina', desc: 'Grave, confiante' },
  { id: 'ballad', label: 'Ballad', gender: 'Masculina', desc: 'Calma, suave' },
  { id: 'coral', label: 'Coral', gender: 'Feminina', desc: 'Clara, profissional' },
  { id: 'sage', label: 'Sage', gender: 'Feminina', desc: 'Madura, assertiva' },
  { id: 'verse', label: 'Verse', gender: 'Masculina', desc: 'Jovem, dinâmica' },
];

const scenarios = [
  { id: 'discovery', label: 'Discovery', icon: Brain, description: 'Primeira conversa, entender necessidade' },
  { id: 'proposal', label: 'Proposta', icon: DollarSign, description: 'Apresentar e defender proposta' },
  { id: 'closing', label: 'Fechamento', icon: Zap, description: 'Fechar o deal' },
  { id: 'objection', label: 'Objeções', icon: ShieldQuestion, description: 'Tratar resistências e dúvidas' },
];

const personaIcons: Record<string, string> = {
  roberto_cetico: '🧐',
  ana_preco: '💰',
  carlos_tecnico: '🔧',
  mariana_indecisa: '🤔',
  pedro_apressado: '⚡',
};

export function RoleplaySetup({ onStart, isConnecting }: RoleplaySetupProps) {
  const [mode, setMode] = useState<'select' | 'custom'>('select');
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState('discovery');
  const [selectedVoice, setSelectedVoice] = useState('ash');

  // Custom persona fields
  const [customName, setCustomName] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [customCompany, setCustomCompany] = useState('');
  const [customContext, setCustomContext] = useState('');

  const canStart = mode === 'select'
    ? !!selectedPersona
    : customName.trim() && customContext.trim();

  const handleStart = () => {
    if (mode === 'select' && selectedPersona) {
      onStart(selectedPersona, selectedScenario, selectedVoice);
    } else if (mode === 'custom') {
      onStart(
        {
          name: customName.trim(),
          role: customRole.trim() || 'Decisor',
          company: customCompany.trim() || 'Empresa',
          context: customContext.trim(),
        },
        selectedScenario,
        selectedVoice
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-sm font-medium">
          <Mic className="h-4 w-4" />
          Roleplay por Voz
        </div>
        <h2 className="text-2xl font-bold">Simulador de Call</h2>
        <p className="text-muted-foreground">
          Treine suas vendas com IA. Escolha um perfil de cliente ou crie o seu.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant={mode === 'select' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('select')}
        >
          <User className="h-4 w-4 mr-1.5" />
          Persona pronta
        </Button>
        <Button
          variant={mode === 'custom' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('custom')}
        >
          <Pencil className="h-4 w-4 mr-1.5" />
          Criar persona
        </Button>
      </div>

      {/* Persona selection */}
      {mode === 'select' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DEFAULT_PERSONAS.map((persona) => (
            <button
              key={persona.id}
              onClick={() => setSelectedPersona(persona.id!)}
              className={cn(
                'relative text-left p-4 rounded-xl border-2 transition-all duration-200',
                'hover:border-amber-500/50 hover:bg-amber-500/5',
                selectedPersona === persona.id
                  ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/20'
                  : 'border-border/50 bg-card'
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center text-lg shrink-0',
                  selectedPersona === persona.id ? 'bg-amber-500/20' : 'bg-muted'
                )}>
                  {personaIcons[persona.id!] || '👤'}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{persona.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {persona.role} — {persona.company}
                  </p>
                  <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">
                    {persona.profile}
                  </p>
                </div>
              </div>
              {selectedPersona === persona.id && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                  <ChevronRight className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4 max-w-lg mx-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome do cliente *</label>
              <Input
                placeholder="Ex: João Silva"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Cargo</label>
              <Input
                placeholder="Ex: CEO"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Empresa</label>
            <Input
              placeholder="Ex: TechCorp"
              value={customCompany}
              onChange={(e) => setCustomCompany(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">
              Briefing do cliente * <span className="text-muted-foreground font-normal">(personalidade, objeções, situação)</span>
            </label>
            <Textarea
              placeholder="Descreva o perfil: como ele se comporta, quais objeções traz, o que já sabe sobre o produto, qual a situação da empresa dele..."
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              rows={5}
            />
          </div>
        </div>
      )}

      {/* Scenario selection */}
      <div>
        <p className="text-sm font-medium text-center mb-3">Cenário da call</p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {scenarios.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedScenario(s.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm',
                  selectedScenario === s.id
                    ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                    : 'border-border/50 hover:border-border text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice selection */}
      <div>
        <p className="text-sm font-medium text-center mb-3">Voz do cliente</p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {voices.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVoice(v.id)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg border transition-all text-sm',
                selectedVoice === v.id
                  ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                  : 'border-border/50 hover:border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="font-medium">{v.label}</span>
              <span className="text-[10px] opacity-70">{v.gender} · {v.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Start button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          disabled={!canStart || isConnecting}
          onClick={handleStart}
          className="px-8 py-6 text-lg bg-amber-500 hover:bg-amber-600 text-black font-semibold"
        >
          {isConnecting ? (
            <>
              <div className="h-5 w-5 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />
              Conectando...
            </>
          ) : (
            <>
              <Mic className="h-5 w-5 mr-2" />
              Iniciar Roleplay
            </>
          )}
        </Button>
      </div>

      {/* Tips */}
      <div className="text-center text-xs text-muted-foreground space-y-1">
        <p>Permita acesso ao microfone quando solicitado</p>
        <p>Use fones de ouvido para melhor experiência</p>
      </div>
    </div>
  );
}
