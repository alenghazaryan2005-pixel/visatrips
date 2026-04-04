'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

interface LegalModalProps {
  title:    string;
  footer:   string;
  isOpen:   boolean;
  onClose:  () => void;
  children: React.ReactNode;
}

export default function LegalModal({ title, footer, isOpen, onClose, children }: LegalModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto px-8 py-6 text-[0.88rem] leading-7 text-mid font-light space-y-0 [&_h4]:font-syne [&_h4]:text-[0.78rem] [&_h4]:font-bold [&_h4]:tracking-widest [&_h4]:uppercase [&_h4]:text-ember [&_h4]:mt-6 [&_h4]:mb-2 [&_h4:first-child]:mt-0 [&_p]:mb-3">
          {children}
        </div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
