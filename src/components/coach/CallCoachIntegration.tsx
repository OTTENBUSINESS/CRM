import { PlaybookSelector } from './PlaybookSelector';
import type { CoachPlaybook } from '@/types/coach.types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

/**
 * Modal para selecionar playbook antes de iniciar uma chamada.
 */
interface PreCallPlaybookSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (playbook: CoachPlaybook | null) => void;
}

export function PreCallPlaybookSelector({ open, onClose, onSelect }: PreCallPlaybookSelectorProps) {
  const handleSelect = (playbook: CoachPlaybook | null) => {
    onSelect(playbook);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-white dark:bg-slate-900">
        <DialogHeader className="sr-only">
          <DialogTitle>Selecionar Playbook</DialogTitle>
          <DialogDescription>Escolha um playbook para a chamada</DialogDescription>
        </DialogHeader>
        <PlaybookSelector
          onSelect={handleSelect}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
