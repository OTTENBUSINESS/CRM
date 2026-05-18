import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";

interface DeleteWithUndoOptions {
  table: string;
  id: string;
  label: string;
  queryClient: QueryClient;
  queryKeys?: string[][];
  /** Use is_active=false instead of hard delete */
  softDelete?: boolean;
  /** Skip undo capability (for cascade deletes) */
  noUndo?: boolean;
}

/**
 * Deletes a row with undo support via toast notification.
 * 1. Captures the row data
 * 2. Deletes (or soft-deletes) the row
 * 3. Invalidates relevant queries
 * 4. Shows toast with "Desfazer" button (unless noUndo)
 * 5. On undo: re-inserts (or restores is_active) and re-invalidates
 */
export async function deleteWithUndo({
  table,
  id,
  label,
  queryClient,
  queryKeys = [],
  softDelete = false,
  noUndo = false,
}: DeleteWithUndoOptions) {
  // 1. Capture full row before deletion
  let captured: Record<string, unknown> | null = null;
  if (!noUndo) {
    const { data } = await supabase.from(table).select("*").eq("id", id).single();
    captured = data;
  }

  // 2. Delete or soft-delete
  if (softDelete) {
    const { error } = await supabase.from(table).update({ is_active: false }).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
  }

  // 3. Invalidate queries
  const invalidate = () => {
    for (const key of queryKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
  invalidate();

  // 4. Toast with optional undo
  const canUndo = !noUndo && captured !== null;

  toast(`${label} excluído(a)`, {
    action: canUndo
      ? {
          label: "Desfazer",
          onClick: async () => {
            try {
              if (softDelete) {
                const { error } = await supabase
                  .from(table)
                  .update({ is_active: true })
                  .eq("id", id);
                if (error) throw error;
              } else {
                const { error } = await supabase.from(table).insert(captured!);
                if (error) throw error;
              }
              invalidate();
              toast.success(`${label} restaurado(a)`);
            } catch {
              toast.error("Erro ao desfazer exclusão");
            }
          },
        }
      : undefined,
    duration: 7000,
  });
}
