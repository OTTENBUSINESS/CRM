import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface DropdownOption {
  id: string;
  field_type: string;
  value: string;
  label: string;
  is_system: boolean;
}

export function useDropdownOptions(fieldType: string) {
  const queryClient = useQueryClient();

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["dropdown-options", fieldType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dropdown_options")
        .select("*")
        .eq("field_type", fieldType)
        .order("is_system", { ascending: false })
        .order("label");
      if (error) throw error;
      return (data || []) as DropdownOption[];
    },
  });

  const addOptionMutation = useMutation({
    mutationFn: async ({ value, label }: { value: string; label: string }) => {
      const { error } = await supabase
        .from("dropdown_options")
        .insert({ field_type: fieldType, value, label })
        .select()
        .single();
      // Ignore unique constraint conflicts (option already exists)
      if (error && !error.message.includes("duplicate") && !error.code?.includes("23505")) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dropdown-options", fieldType] });
    },
  });

  const addOption = (value: string, label: string) => {
    addOptionMutation.mutate({ value, label });
  };

  return {
    options: options.map((o) => ({ value: o.value, label: o.label })),
    isLoading,
    addOption,
  };
}
