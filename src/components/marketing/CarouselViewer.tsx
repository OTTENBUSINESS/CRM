/**
 * CarouselViewer — visualizador de carrossel inline no chat do Heitor.
 *
 * Heitor retorna um code block com lang `carousel` contendo JSON:
 *   { id, title?, slides: [url1, url2, ...], editor_url? }
 *
 * Renderiza um carrossel swipeable estilo Instagram com indicadores,
 * navegacao por setas, fullscreen ao click.
 */

import { useState, useCallback, useEffect } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, X, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Baixa uma imagem cross-origin via fetch→blob (funciona com Supabase storage). */
async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Fallback: abre em nova aba
    window.open(url, '_blank');
  }
}

export interface CarouselData {
  id?: string;
  title?: string;
  slides: string[];
  editor_url?: string;
}

export function CarouselViewer({ data }: { data: CarouselData }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: 'center' });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => void emblaApi.off('select', onSelect);
  }, [emblaApi, onSelect]);

  const scrollPrev = () => emblaApi?.scrollPrev();
  const scrollNext = () => emblaApi?.scrollNext();
  const scrollTo = (i: number) => emblaApi?.scrollTo(i);

  const [downloadingAll, setDownloadingAll] = useState(false);
  const downloadAll = async () => {
    setDownloadingAll(true);
    for (let i = 0; i < data.slides.length; i++) {
      await downloadImage(data.slides[i], `slide-${i + 1}.png`);
      await new Promise((r) => setTimeout(r, 300));  // evita bloqueio do browser
    }
    setDownloadingAll(false);
  };

  if (!data.slides?.length) return null;

  return (
    <>
      <div className="my-3 rounded-xl border bg-background overflow-hidden">
        {/* Header — sempre visível agora (tem download) */}
        <div className="px-3 py-2 border-b flex items-center justify-between gap-2 bg-muted/30">
          <div className="text-xs text-muted-foreground truncate flex-1">
            {data.title
              ? <span className="font-medium text-foreground">{data.title}</span>
              : <span>Carrossel · {data.slides.length} slides</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={downloadAll}
              disabled={downloadingAll}
              className="text-[11px] inline-flex items-center gap-1 text-orange-600 hover:underline disabled:opacity-50"
            >
              {downloadingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              baixar tudo
            </button>
            {data.editor_url && (
              <a
                href={data.editor_url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] inline-flex items-center gap-1 text-orange-600 hover:underline"
              >
                editor <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Carrossel — fundo neutro suave (não preto) + aspect 4:5 (formato IG) */}
        <div className="relative bg-muted/40">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {data.slides.map((url, i) => (
                <div
                  key={i}
                  className="flex-[0_0_100%] min-w-0 aspect-[4/5] relative cursor-zoom-in"
                  onClick={() => setFullscreenIndex(i)}
                >
                  <img
                    src={url}
                    alt={`Slide ${i + 1}`}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                  <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm">
                    {i + 1}/{data.slides.length}
                  </div>
                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadImage(url, `slide-${i + 1}.png`);
                      }}
                      className="bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70 backdrop-blur-sm"
                      aria-label="Baixar slide"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFullscreenIndex(i);
                      }}
                      className="bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70 backdrop-blur-sm"
                      aria-label="Tela cheia"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Setas */}
          {data.slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={scrollPrev}
                disabled={selectedIndex === 0}
                className={cn(
                  'absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full',
                  'bg-white/90 dark:bg-black/70 shadow-md flex items-center justify-center',
                  'hover:bg-white dark:hover:bg-black transition-all',
                  'disabled:opacity-0 disabled:pointer-events-none',
                )}
                aria-label="Anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={scrollNext}
                disabled={selectedIndex === data.slides.length - 1}
                className={cn(
                  'absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full',
                  'bg-white/90 dark:bg-black/70 shadow-md flex items-center justify-center',
                  'hover:bg-white dark:hover:bg-black transition-all',
                  'disabled:opacity-0 disabled:pointer-events-none',
                )}
                aria-label="Proximo"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Indicadores (bolinhas) */}
        {data.slides.length > 1 && (
          <div className="px-3 py-2 flex items-center justify-center gap-1.5">
            {data.slides.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  selectedIndex === i ? 'w-6 bg-orange-500' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50',
                )}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen modal */}
      {fullscreenIndex !== null && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setFullscreenIndex(null)}
        >
          <button
            type="button"
            onClick={() => setFullscreenIndex(null)}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute top-4 left-4 text-white text-sm">
            {fullscreenIndex + 1} / {data.slides.length}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              downloadImage(data.slides[fullscreenIndex], `slide-${fullscreenIndex + 1}.png`);
            }}
            className="absolute top-4 right-16 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            aria-label="Baixar"
          >
            <Download className="h-5 w-5" />
          </button>
          <img
            src={data.slides[fullscreenIndex]}
            alt={`Slide ${fullscreenIndex + 1}`}
            className="max-w-[95vw] max-h-[95vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {fullscreenIndex > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFullscreenIndex(fullscreenIndex - 1);
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {fullscreenIndex < data.slides.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFullscreenIndex(fullscreenIndex + 1);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              aria-label="Proximo"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Tenta parsear conteudo de code block como CarouselData.
 * Retorna null se nao for valido.
 */
/**
 * Aceita 3 formatos dentro do code block ```carousel:
 *   1. JSON: { "slides": ["url1","url2"], "title": "...", "editor_url": "..." }
 *   2. URLs soltas (uma por linha) — formato que o LLM costuma gerar
 *   3. Markdown de imagens ![](url) por linha
 *
 * Robusto porque o LLM varia o formato — melhor aceitar tudo que parsear errado.
 */
export function parseCarouselBlock(raw: string): CarouselData | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  // 1. Tenta JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.slides)
        && parsed.slides.length > 0 && parsed.slides.every((s: any) => typeof s === 'string')) {
      return parsed as CarouselData;
    }
  } catch { /* não é JSON — tenta linha a linha */ }

  // 2/3. Extrai URLs linha a linha (URL crua OU markdown ![](url))
  const urlRegex = /https?:\/\/[^\s)'"]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)'"]*)?/i;
  const slides: string[] = [];
  for (const line of trimmed.split('\n')) {
    const m = line.match(urlRegex);
    if (m) slides.push(m[0]);
  }

  if (slides.length === 0) return null;
  return { slides };
}
