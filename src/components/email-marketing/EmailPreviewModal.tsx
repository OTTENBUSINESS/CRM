import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  html: string;
  subject: string;
}

export default function EmailPreviewModal({ open, onOpenChange, html, subject }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-normal text-muted-foreground">
            Preview: <span className="font-medium text-foreground">{subject}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto border rounded-lg bg-white">
          <iframe
            srcDoc={html}
            className="w-full min-h-[500px] border-0"
            title="Email Preview"
            sandbox="allow-same-origin"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
