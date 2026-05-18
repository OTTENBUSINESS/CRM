import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { X } from "lucide-react";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider duration={5000}>
      {toasts.length >= 1 && (
        <button
          onClick={() => dismiss()}
          className="pointer-events-auto fixed bottom-2 right-2 z-[101] flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-slate-700 transition-colors sm:bottom-auto sm:top-2 sm:right-4"
        >
          <X className="h-3 w-3" />
          Limpar {toasts.length > 1 ? `todas (${toasts.length})` : ""}
        </button>
      )}
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
