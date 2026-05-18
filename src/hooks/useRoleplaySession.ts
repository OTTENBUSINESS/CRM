import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/* ================================================================
 * Types
 * ================================================================ */

export interface RoleplayPersona {
  id?: string;
  name: string;
  role: string;
  company: string;
  profile: string;
  avatar: string;
}

export interface CustomPersona {
  name: string;
  role: string;
  company: string;
  context: string;
}

export interface TranscriptionEntry {
  id: string;
  text: string;
  isFinal: boolean;
  speaker: 'vendedor' | 'cliente';
}

export interface RoleplaySession {
  id: string;
  persona_name: string;
  persona_role: string;
  persona_company: string;
  scenario: string;
  voice: string;
  duration_seconds: number;
  score: number | null;
  verdict: string | null;
  evaluation: any;
  created_at: string;
}

/* ================================================================
 * Default personas
 * ================================================================ */

export const DEFAULT_PERSONAS: RoleplayPersona[] = [
  {
    id: 'roberto_cetico',
    name: 'Roberto Cético',
    role: 'CEO',
    company: 'TechSolutions',
    profile: 'Desconfiado, exige dados e ROI comprovado. Já foi enganado por fornecedores antes.',
    avatar: '🧐',
  },
  {
    id: 'ana_preco',
    name: 'Ana Preço',
    role: 'Diretora de Compras',
    company: 'GrupoVarejo',
    profile: 'Sempre negocia preço, tem 3 concorrentes na mesa. Meta: 30% de desconto.',
    avatar: '💰',
  },
  {
    id: 'carlos_tecnico',
    name: 'Carlos Técnico',
    role: 'CTO',
    company: 'StartupTech',
    profile: 'Quer entender integrações, segurança e escalabilidade antes de qualquer decisão.',
    avatar: '🔧',
  },
  {
    id: 'mariana_indecisa',
    name: 'Mariana Indecisa',
    role: 'Gerente de Operações',
    company: 'AgênciaMKT',
    profile: 'Precisa aprovar com o chefe, sempre empurra a decisão. Difícil de comprometer.',
    avatar: '🤔',
  },
  {
    id: 'pedro_apressado',
    name: 'Pedro Apressado',
    role: 'Sócio-fundador',
    company: 'ConsultoriaFin',
    profile: 'Tempo muito limitado, quer ir direto ao ponto. Interrompe bastante.',
    avatar: '⚡',
  },
];

/* ================================================================
 * saveRoleplaySession — persiste no banco (graceful)
 * ================================================================ */

interface SaveArgs {
  persona: RoleplayPersona;
  scenario: string;
  voice: string;
  duration: number;
  transcription: TranscriptionEntry[];
  evaluation: any;
  score: number;
  verdict: string;
  userId: string;
}

export async function saveRoleplaySession(args: SaveArgs): Promise<void> {
  try {
    const transcriptText = args.transcription
      .filter(t => t.isFinal)
      .map(t => `[${t.speaker === 'vendedor' ? 'Você' : args.persona.name}]: ${t.text}`)
      .join('\n');

    await (supabase as any)
      .from('roleplay_sessions')
      .insert([{
        persona_name: args.persona.name,
        persona_role: args.persona.role,
        persona_company: args.persona.company,
        persona_id: args.persona.id ?? null,
        scenario: args.scenario,
        voice: args.voice,
        duration_seconds: args.duration,
        transcript: transcriptText,
        evaluation: args.evaluation,
        score: args.score,
        verdict: args.verdict,
        created_by: args.userId,
      }]);
  } catch {
    // Tabela pode não existir em ambientes de demo — falha silenciosa
  }
}

/* ================================================================
 * useRoleplayHistory — busca sessoes salvas
 * ================================================================ */

export function useRoleplayHistory() {
  return useQuery({
    queryKey: ['roleplay-history'],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('roleplay_sessions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) return [] as RoleplaySession[];
        return (data ?? []) as RoleplaySession[];
      } catch {
        return [] as RoleplaySession[];
      }
    },
    staleTime: 1000 * 60,
  });
}

/* ================================================================
 * useRoleplaySession — estado local da sessao ativa
 * ================================================================ */

export type RoleplayStatus = 'idle' | 'connecting' | 'active' | 'ended';

export interface RoleplaySessionState {
  status: RoleplayStatus;
  persona: RoleplayPersona | null;
  scenario: string;
  voice: string;
  duration: number;
  transcription: TranscriptionEntry[];
  isMuted: boolean;
  isAiSpeaking: boolean;
  startSession: (personaOrCustom: string | CustomPersona, scenario: string, voice: string) => void;
  endSession: () => void;
  resetSession: () => void;
  toggleMute: () => void;
}

function resolvePersona(input: string | CustomPersona): RoleplayPersona {
  if (typeof input === 'string') {
    const found = DEFAULT_PERSONAS.find(p => p.id === input);
    return found ?? {
      id: input,
      name: input,
      role: 'Cliente',
      company: 'Empresa',
      profile: '',
      avatar: '👤',
    };
  }
  return {
    name: input.name,
    role: input.role || 'Decisor',
    company: input.company || 'Empresa',
    profile: input.context,
    avatar: '🤖',
  };
}

let _entryId = 0;
function nextId() {
  return `entry-${++_entryId}`;
}

export function useRoleplaySession(): RoleplaySessionState {
  const [status, setStatus] = useState<RoleplayStatus>('idle');
  const [persona, setPersona] = useState<RoleplayPersona | null>(null);
  const [scenario, setScenario] = useState('');
  const [voice, setVoice] = useState('ash');
  const [duration, setDuration] = useState(0);
  const [transcription, setTranscription] = useState<TranscriptionEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startSession = useCallback(
    (personaOrCustom: string | CustomPersona, scenarioArg: string, voiceArg: string) => {
      const resolved = resolvePersona(personaOrCustom);

      setStatus('connecting');
      setPersona(resolved);
      setScenario(scenarioArg);
      setVoice(voiceArg);
      setDuration(0);
      setTranscription([]);
      setIsMuted(false);
      setIsAiSpeaking(false);

      // Simula conexão (demo sem backend de voz real)
      const connectTimeout = setTimeout(() => {
        setStatus('active');

        // Timer de duração
        timerRef.current = setInterval(() => {
          setDuration(prev => prev + 1);
        }, 1000);

        // Simula IA falando/ouvindo alternadamente
        const aiInterval = setInterval(() => {
          setIsAiSpeaking(prev => !prev);
        }, 3500);

        // Simula linhas de transcrição
        const lines: Array<{ speaker: 'vendedor' | 'cliente'; text: string }> = [
          { speaker: 'cliente', text: `Olá, ${resolved.name} aqui. Pode falar?` },
          { speaker: 'vendedor', text: 'Olá! Claro, obrigado pelo tempo. Posso apresentar nossa solução?' },
          { speaker: 'cliente', text: 'Sim, mas seja rápido. Tenho 10 minutos.' },
          { speaker: 'vendedor', text: 'Entendido. Qual é o maior desafio de vendas da sua empresa hoje?' },
          { speaker: 'cliente', text: 'Nosso pipeline está desorganizado e perdemos muito por falta de follow-up.' },
        ];

        let lineIdx = 0;
        const transcriptInterval = setInterval(() => {
          if (lineIdx < lines.length) {
            const line = lines[lineIdx++];
            setTranscription(prev => [
              ...prev,
              {
                id: nextId(),
                text: line.text,
                isFinal: true,
                speaker: line.speaker,
              },
            ]);
          } else {
            clearInterval(transcriptInterval);
          }
        }, 3000);

        cleanupRef.current = () => {
          clearInterval(aiInterval);
          clearInterval(transcriptInterval);
        };
      }, 1500);

      return () => clearTimeout(connectTimeout);
    },
    []
  );

  const endSession = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setStatus('ended');
    setIsAiSpeaking(false);
  }, []);

  const resetSession = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setStatus('idle');
    setPersona(null);
    setScenario('');
    setDuration(0);
    setTranscription([]);
    setIsMuted(false);
    setIsAiSpeaking(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  return {
    status,
    persona,
    scenario,
    voice,
    duration,
    transcription,
    isMuted,
    isAiSpeaking,
    startSession,
    endSession,
    resetSession,
    toggleMute,
  };
}
