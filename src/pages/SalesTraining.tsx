import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Search, Plus, Loader2, Mic } from 'lucide-react';
import { useSalesTrainingCases } from '@/hooks/useSalesTraining';
import { TrainingCaseCard } from '@/components/sales/training/TrainingCaseCard';
import { TrainingCaseDetail } from '@/components/sales/training/TrainingCaseDetail';
import { SaveToTrainingModal } from '@/components/sales/training/SaveToTrainingModal';
import { RoleplaySetup, RoleplayMeeting, RoleplayResults, RoleplayHistory } from '@/components/sales/training/roleplay';
import { useRoleplaySession } from '@/hooks/useRoleplaySession';
import type { TrainingCase } from '@/hooks/useSalesTraining';
import type { CustomPersona } from '@/hooks/useRoleplaySession';
import { cn } from '@/lib/utils';

const categories = [
  { value: 'all', label: 'Todos' },
  { value: 'sdr_call', label: 'SDR' },
  { value: 'closer_call', label: 'Closer' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'objection_handling', label: 'Objeções' },
  { value: 'closing', label: 'Fechamento' },
  { value: 'discovery', label: 'Discovery' },
];

export default function SalesTraining() {
  const [activeTab, setActiveTab] = useState<'library' | 'roleplay'>('library');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [selectedCase, setSelectedCase] = useState<TrainingCase | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const roleplay = useRoleplaySession();

  const { data: cases, isLoading } = useSalesTrainingCases({
    category,
    outcome,
    difficulty,
    search: search || undefined,
  });

  const handleStartRoleplay = (personaOrCustom: string | CustomPersona, scenario: string, voice: string) => {
    roleplay.startSession(personaOrCustom, scenario, voice);
  };

  // Fullscreen meeting view — renders outside the normal layout
  if (roleplay.status === 'active' && roleplay.persona) {
    return (
      <RoleplayMeeting
        persona={roleplay.persona}
        duration={roleplay.duration}
        transcription={roleplay.transcription}
        isMuted={roleplay.isMuted}
        isAiSpeaking={roleplay.isAiSpeaking}
        onToggleMute={roleplay.toggleMute}
        onEnd={roleplay.endSession}
      />
    );
  }

  // Results view
  if (roleplay.status === 'ended' && roleplay.persona) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <RoleplayResults
          persona={roleplay.persona}
          scenario={roleplay.scenario}
          voice={roleplay.voice}
          duration={roleplay.duration}
          transcription={roleplay.transcription}
          onReset={roleplay.resetSession}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Treinamento Comercial</h1>
            <p className="text-sm text-muted-foreground">
              Biblioteca de casos reais e simulador de calls
            </p>
          </div>
        </div>
        {activeTab === 'library' && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Caso
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/50">
        <button
          onClick={() => setActiveTab('library')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'library'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <BookOpen className="h-4 w-4 inline mr-1.5" />
          Biblioteca
        </button>
        <button
          onClick={() => setActiveTab('roleplay')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'roleplay'
              ? 'border-amber-500 text-amber-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Mic className="h-4 w-4 inline mr-1.5" />
          Roleplay
          <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-amber-500/10 text-amber-500 rounded-full font-semibold">
            NOVO
          </span>
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'roleplay' ? (
        <>
          <RoleplaySetup
            onStart={handleStartRoleplay}
            isConnecting={roleplay.status === 'connecting'}
          />
          <RoleplayHistory />
        </>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {categories.map(cat => (
                <Button
                  key={cat.value}
                  variant={category === cat.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCategory(cat.value)}
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 w-48"
                />
              </div>

              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Resultado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="positive">Positivo</SelectItem>
                  <SelectItem value="negative">Negativo</SelectItem>
                  <SelectItem value="neutral">Neutro</SelectItem>
                </SelectContent>
              </Select>

              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Dificuldade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="beginner">Iniciante</SelectItem>
                  <SelectItem value="intermediate">Intermediário</SelectItem>
                  <SelectItem value="advanced">Avançado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stats */}
          {cases && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{cases.length} caso(s)</span>
              {cases.length > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {cases.filter(c => c.outcome === 'positive').length} positivo(s),{' '}
                    {cases.filter(c => c.outcome === 'negative').length} negativo(s)
                  </span>
                </>
              )}
            </div>
          )}

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cases && cases.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cases.map(c => (
                <TrainingCaseCard
                  key={c.id}
                  trainingCase={c}
                  onClick={() => setSelectedCase(c)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <h3 className="mt-4 text-lg font-medium">Nenhum caso de treinamento</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Salve chamadas e reuniões como material de treinamento para o time.
              </p>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      <TrainingCaseDetail
        trainingCase={selectedCase}
        open={!!selectedCase}
        onOpenChange={open => !open && setSelectedCase(null)}
      />

      {/* Manual create modal */}
      {showCreate && (
        <SaveToTrainingModal
          open={showCreate}
          onOpenChange={setShowCreate}
          defaultData={{
            title: '',
            source_type: 'manual',
          }}
        />
      )}
    </div>
  );
}
