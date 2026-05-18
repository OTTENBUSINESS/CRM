/**
 * Gemini Live API WebSocket Coach
 * Persistent bidirectional connection for real-time sales coaching.
 * Latency: ~100-200ms (vs ~1.1s with generateContent)
 */

import { useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

interface CoachResponse {
  type: 'objection_handler' | 'question' | 'closing' | 'tip' | 'info';
  text: string;
  completed_items?: string[];
}

interface UseGeminiLiveCoachOptions {
  onSuggestion: (response: CoachResponse) => void;
  onError?: (error: string) => void;
}

let apiKeyCache: string | null = null;

async function getApiKey(): Promise<string> {
  if (apiKeyCache) return apiKeyCache;
  const { data } = await supabase.functions.invoke('gemini-token');
  if (!data?.api_key) throw new Error('No Gemini API key');
  apiKeyCache = data.api_key;
  return apiKeyCache;
}

export function useGeminiLiveCoach({ onSuggestion, onError }: UseGeminiLiveCoachOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const pendingTextRef = useRef('');
  const onSuggestionRef = useRef(onSuggestion);
  const onErrorRef = useRef(onError);
  onSuggestionRef.current = onSuggestion;
  onErrorRef.current = onError;

  const connect = useCallback(async (systemInstruction: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const apiKey = await getApiKey();
      const ws = new WebSocket(`${WS_URL}?key=${apiKey}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[LiveCoach] WebSocket connected, sending setup...');
        // Send setup message with config
        ws.send(JSON.stringify({
          setup: {
            model: 'models/gemini-2.0-flash-live-001',
            generationConfig: {
              responseModalities: ['TEXT'],
              temperature: 0.3,
              maxOutputTokens: 80,
              responseMimeType: 'application/json',
            },
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            },
          }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Setup complete
          if (msg.setupComplete) {
            console.log('[LiveCoach] Setup complete, session ready');
            setIsConnected(true);
            return;
          }

          // Server content (model response)
          if (msg.serverContent?.modelTurn?.parts) {
            const text = msg.serverContent.modelTurn.parts
              .map((p: any) => p.text || '')
              .join('');

            if (text) {
              pendingTextRef.current += text;
            }
          }

          // Turn complete — process accumulated text
          if (msg.serverContent?.turnComplete) {
            const fullText = pendingTextRef.current.trim();
            pendingTextRef.current = '';

            if (fullText) {
              console.log('[LiveCoach] Response:', fullText.substring(0, 80));
              try {
                const clean = fullText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const jsonMatch = clean.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  if (parsed.text) {
                    onSuggestionRef.current({
                      type: parsed.type || 'tip',
                      text: parsed.text,
                      completed_items: Array.isArray(parsed.completed_items) ? parsed.completed_items : [],
                    });
                  }
                }
              } catch (e) {
                console.warn('[LiveCoach] Parse error:', fullText.substring(0, 50));
              }
            }
          }
        } catch (e) {
          // Ignore non-JSON messages
        }
      };

      ws.onerror = (e) => {
        console.error('[LiveCoach] WebSocket error:', e);
        onErrorRef.current?.('WebSocket error');
      };

      ws.onclose = (e) => {
        console.log('[LiveCoach] WebSocket closed:', e.code, e.reason);
        setIsConnected(false);
        wsRef.current = null;
      };
    } catch (err: any) {
      console.error('[LiveCoach] Connection error:', err.message);
      onErrorRef.current?.(err.message);
    }
  }, []);

  const sendTranscription = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text }]
        }],
        turnComplete: true,
      }
    }));
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return {
    connect,
    sendTranscription,
    disconnect,
    isConnected,
  };
}
