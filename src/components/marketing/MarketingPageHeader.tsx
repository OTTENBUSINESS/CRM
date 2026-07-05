import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Tag pequena em uppercase tracking (ex: "Marketing · Email") */
  eyebrow?: string;
  /** Título principal em serif */
  title: string;
  /** Descrição curta */
  description?: ReactNode;
  /** Ação primária no canto direito (ex: botão "Nova campanha") */
  action?: ReactNode;
  /** Conteúdo extra à direita (tabs de período, filtros, badges) */
  rightAccessory?: ReactNode;
  /** Esconde border-bottom (quando há tabs logo abaixo) */
  noBorder?: boolean;
  className?: string;
}

/**
 * Header padronizado para as páginas de Marketing.
 * Segue o mesmo padrão editorial usado em Settings.
 *
 * Uso:
 * <MarketingPageHeader
 *   eyebrow="Marketing · Email"
 *   title="Campanhas"
 *   description="Dispare emails em massa para listas filtradas ou leads específicos"
 *   action={<Button>Nova campanha</Button>}
 * />
 */
export default function MarketingPageHeader({
  eyebrow,
  title,
  description,
  action,
  rightAccessory,
  noBorder = false,
  className,
}: Props) {
  return (
    <header
      className={cn(
        'flex items-start justify-between gap-4 pb-4',
        !noBorder && 'border-b border-border/60',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
            {eyebrow}
          </span>
        )}
        <h1 className="text-2xl font-semibold mt-1 leading-tight tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      {(rightAccessory || action) && (
        <div className="flex items-center gap-3 shrink-0">
          {rightAccessory}
          {action}
        </div>
      )}
    </header>
  );
}

/**
 * Empty state padronizado.
 */
export function MarketingEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: any;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
