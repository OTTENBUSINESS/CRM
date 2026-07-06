import { motion } from "framer-motion";
import { SearchX, Sparkles } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon = "search",
}: {
  title: string;
  description: string;
  icon?: "search" | "sparkles";
}) {
  const Icon = icon === "sparkles" ? Sparkles : SearchX;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </motion.div>
  );
}
