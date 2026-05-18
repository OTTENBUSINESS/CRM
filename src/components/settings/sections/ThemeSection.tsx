import { Card, CardContent } from "@/components/ui/card";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <p className="font-medium mb-4">Tema da interface</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTheme("light")}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                theme === "light"
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className={`p-2 rounded-full ${theme === "light" ? "bg-accent/10" : "bg-muted"}`}>
                <Sun className={`h-5 w-5 ${theme === "light" ? "text-accent" : "text-muted-foreground"}`} />
              </div>
              <div className="text-left">
                <p className="font-medium text-sm">Claro</p>
                <p className="text-xs text-muted-foreground">Fundo branco, texto escuro</p>
              </div>
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                theme === "dark"
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className={`p-2 rounded-full ${theme === "dark" ? "bg-accent/10" : "bg-muted"}`}>
                <Moon className={`h-5 w-5 ${theme === "dark" ? "text-accent" : "text-muted-foreground"}`} />
              </div>
              <div className="text-left">
                <p className="font-medium text-sm">Escuro</p>
                <p className="text-xs text-muted-foreground">Fundo escuro, texto claro</p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
