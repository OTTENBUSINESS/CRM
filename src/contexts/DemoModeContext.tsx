import { createContext, useContext, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface DemoModeContextType {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  /** Multiply monetary value by 5x when demo mode is active */
  dv: (value: number) => number;
}

const DemoModeContext = createContext<DemoModeContextType>({
  isDemoMode: false,
  toggleDemoMode: () => {},
  dv: (n) => n,
});

// CSS global pra blur de dados sensíveis
const BLUR_STYLE_ID = 'demo-mode-blur-style';
const BLUR_CSS = `
  body.demo-blur [data-sensitive="name"],
  body.demo-blur [data-sensitive="phone"],
  body.demo-blur [data-sensitive="email"],
  body.demo-blur [data-sensitive="company"],
  body.demo-blur [data-sensitive] {
    filter: blur(5px) !important;
    user-select: none !important;
    transition: filter 0.3s ease;
  }
  body.demo-blur [data-sensitive]:hover {
    filter: blur(3px) !important;
  }
  /* Blur genérico em campos conhecidos */
  body.demo-blur .conversation-name,
  body.demo-blur .lead-name,
  body.demo-blur .lead-phone,
  body.demo-blur .lead-email,
  body.demo-blur [class*="contact_phone"],
  body.demo-blur [class*="contact-phone"],
  body.demo-blur a[href^="tel:"],
  body.demo-blur a[href^="mailto:"] {
    filter: blur(5px) !important;
    user-select: none !important;
  }
`;

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    return localStorage.getItem("crm-demo-mode") === "true";
  });

  let queryClient: any = null;
  try { queryClient = useQueryClient(); } catch {}

  const toggleDemoMode = () => {
    setIsDemoMode((prev) => {
      const next = !prev;
      localStorage.setItem("crm-demo-mode", String(next));
      // Invalidar todo cache do dashboard pra recalcular com novo multiplicador
      if (queryClient) {
        queryClient.invalidateQueries({ queryKey: ['dashboard-v2'] });
        queryClient.invalidateQueries({ predicate: (q: any) => q.queryKey[0]?.toString().startsWith('dashboard-v2') });
      }
      return next;
    });
  };

  // Inject/remove blur CSS + body class
  useEffect(() => {
    if (isDemoMode) {
      document.body.classList.add('demo-blur');
      if (!document.getElementById(BLUR_STYLE_ID)) {
        const style = document.createElement('style');
        style.id = BLUR_STYLE_ID;
        style.textContent = BLUR_CSS;
        document.head.appendChild(style);
      }
    } else {
      document.body.classList.remove('demo-blur');
      const style = document.getElementById(BLUR_STYLE_ID);
      if (style) style.remove();
    }
  }, [isDemoMode]);

  const dv = (n: number) => (isDemoMode ? n * 5 : n);

  return (
    <DemoModeContext.Provider value={{ isDemoMode, toggleDemoMode, dv }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export const useDemoMode = () => useContext(DemoModeContext);
