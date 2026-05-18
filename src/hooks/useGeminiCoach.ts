import { useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

let geminiClient: GoogleGenAI | null = null;
let apiKeyPromise: Promise<string> | null = null;

async function getApiKey(): Promise<string> {
  if (!apiKeyPromise) {
    apiKeyPromise = supabase.functions.invoke('gemini-token').then(({ data, error }) => {
      if (error || !data?.api_key) throw new Error('Failed to get Gemini API key');
      return data.api_key as string;
    });
  }
  return apiKeyPromise;
}

async function getClient(): Promise<GoogleGenAI> {
  if (!geminiClient) {
    const key = await getApiKey();
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

interface CoachRequest {
  transcription: string;
  phaseName: string;
  phaseDescription?: string;
  phaseChecklist?: Array<{ id: string; text: string }>;
  leadContext?: string;
}

interface CoachResponse {
  has_suggestion: boolean;
  suggestion?: {
    type: 'tip' | 'question' | 'objection_handler' | 'closing' | 'info';
    text: string;
    confidence: number;
  };
  completed_items?: string[];
}

export function useGeminiCoach() {
  const isRequestingRef = useRef(false);
  const lastRequestTimeRef = useRef(0);

  const requestCoachSuggestion = useCallback(async (req: CoachRequest): Promise<CoachResponse> => {
    // Prevent concurrent
    if (isRequestingRef.current) {
      return { has_suggestion: false };
    }

    // Cooldown 1.5s
    const now = Date.now();
    if (now - lastRequestTimeRef.current < 1500) {
      return { has_suggestion: false };
    }

    isRequestingRef.current = true;
    lastRequestTimeRef.current = now;

    try {
      const client = await getClient();

      const checklistText = req.phaseChecklist && req.phaseChecklist.length > 0
        ? 'Checklist: ' + req.phaseChecklist.map(i => `[${i.id}] ${i.text}`).join('; ')
        : '';

      const prompt = `Coach de vendas em tempo real. De UMA sugestao curta pro vendedor.

${req.leadContext || ''}Fase: ${req.phaseName}${req.phaseDescription ? ' (' + req.phaseDescription + ')' : ''}
${checklistText}

Conversa:
${req.transcription}

JSON (sem markdown):
{"type":"tip","text":"sugestao","completed_items":[]}
Tipos: tip, question, objection_handler, closing, info`;

      const startTime = Date.now();

      const response = await client.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          temperature: 0.7,
          maxOutputTokens: 150,
          responseMimeType: 'application/json',
        },
      });

      const latency = Date.now() - startTime;
      const text = response.text || '';

      console.log(`[GeminiCoach] Response in ${latency}ms:`, text.substring(0, 100));

      if (!text) return { has_suggestion: false };

      const parsed = JSON.parse(text);

      return {
        has_suggestion: true,
        suggestion: {
          type: parsed.type || 'tip',
          text: parsed.text || 'Continue a conversa',
          confidence: 0.8,
        },
        completed_items: Array.isArray(parsed.completed_items) ? parsed.completed_items : [],
      };
    } catch (err: any) {
      console.error('[GeminiCoach] Error:', err.message);
      return { has_suggestion: false };
    } finally {
      isRequestingRef.current = false;
    }
  }, []);

  return { requestCoachSuggestion };
}
