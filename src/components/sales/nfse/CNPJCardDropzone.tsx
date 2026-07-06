import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useExtractCNPJCard, type ExtractedCNPJData } from "@/hooks/useNFSe";
import { FileUp, Loader2, Sparkles } from "lucide-react";

interface CNPJCardDropzoneProps {
  /** Chamado com os dados extraidos do Cartao CNPJ */
  onExtracted: (data: ExtractedCNPJData) => void;
  className?: string;
}

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

/**
 * Dropzone pra Cartao CNPJ (PDF ou imagem). Envia pro edge function
 * extract-cnpj-card (Claude Vision) e devolve os dados extraidos.
 */
export function CNPJCardDropzone({ onExtracted, className }: CNPJCardDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const extractMutation = useExtractCNPJCard();

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Arquivo invalido", {
        description: "Envie o Cartao CNPJ em PDF ou imagem (PNG, JPG, WebP).",
      });
      return;
    }

    try {
      const data = await extractMutation.mutateAsync(file);
      onExtracted(data);
      toast.success("Dados extraidos do Cartao CNPJ!", {
        description: data.razao_social
          ? `${data.razao_social} — confira os campos preenchidos.`
          : "Confira os campos preenchidos antes de salvar.",
      });
    } catch (error: any) {
      toast.error("Erro ao extrair dados do Cartao CNPJ", {
        description: error?.message || "Tente novamente com um arquivo mais legivel.",
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !extractMutation.isPending && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !extractMutation.isPending) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (!extractMutation.isPending) handleFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40",
        extractMutation.isPending && "opacity-70 cursor-wait",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {extractMutation.isPending ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium">Extraindo dados com IA...</p>
          <p className="text-xs text-muted-foreground">Isso leva alguns segundos.</p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-primary">
            <FileUp className="h-5 w-5" />
            <Sparkles className="h-4 w-4" />
          </div>
          <p className="text-sm font-medium">Enviar Cartao CNPJ (PDF ou imagem)</p>
          <p className="text-xs text-muted-foreground">
            A IA extrai CNPJ, razao social e endereco automaticamente.
          </p>
        </>
      )}
    </div>
  );
}
