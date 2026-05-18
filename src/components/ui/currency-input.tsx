import * as React from 'react';
import { cn } from '@/lib/utils';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** Value in cents (integer) to avoid floating point issues */
  value: number;
  /** Called with the new value in cents */
  onValueChange: (cents: number) => void;
}

/**
 * Brazilian Real currency input with live formatting.
 * Stores value as integer cents internally for precision.
 * Displays: R$ 1.234,56
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onValueChange, placeholder, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => inputRef.current!);

    const formatDisplay = (cents: number): string => {
      if (cents === 0) return '';
      const abs = Math.abs(cents);
      const reais = Math.floor(abs / 100);
      const centavos = abs % 100;
      const reaisFormatted = reais.toLocaleString('pt-BR');
      return `${cents < 0 ? '-' : ''}${reaisFormatted},${String(centavos).padStart(2, '0')}`;
    };

    const [displayValue, setDisplayValue] = React.useState(() => formatDisplay(value));

    // Sync display when value changes externally (e.g. form reset)
    React.useEffect(() => {
      const currentCents = parseToCents(displayValue);
      if (currentCents !== value) {
        setDisplayValue(formatDisplay(value));
      }
    }, [value]);

    const parseToCents = (str: string): number => {
      // Remove everything except digits
      const digits = str.replace(/\D/g, '');
      return digits ? parseInt(digits, 10) : 0;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const cents = parseToCents(raw);

      // Cap at 999.999.999,99 (~ R$ 10M)
      const capped = Math.min(cents, 99999999999);
      setDisplayValue(formatDisplay(capped));
      onValueChange(capped);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, arrows
      const allowed = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (allowed.includes(e.key)) return;

      // Allow Ctrl/Cmd + A/C/V/X
      if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return;

      // Only allow digits
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
      }
    };

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none pointer-events-none">
          R$
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          value={displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || '0,00'}
          {...props}
        />
      </div>
    );
  },
);

CurrencyInput.displayName = 'CurrencyInput';

export { CurrencyInput };

// ─── Helpers ────────────────────────────────
/** Convert a float (e.g. 1234.56) to cents (123456) */
export const toCents = (float: number): number => Math.round(float * 100);

/** Convert cents (123456) to float (1234.56) */
export const toFloat = (cents: number): number => cents / 100;
