'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useMediaQuery } from '@/hooks/use-media-query';

interface BucketInfoIconProps {
  bucketName: string;
  explanation: string;
}

export function BucketInfoIcon({ bucketName, explanation }: BucketInfoIconProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`About the ${bucketName} bucket`}
          className="text-[#52525B] hover:text-[#71717A] transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
        </button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            showCloseButton
            className="max-w-[calc(100vw-32px)] bg-[#0A0A0B] border-[#00D9A3]/20 shadow-[0_0_40px_rgba(0,217,163,0.15)] p-6"
          >
            <DialogTitle className="text-base font-semibold text-[#FAFAFA]">
              {bucketName}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#A1A1AA] leading-relaxed mt-2">
              {explanation}
            </DialogDescription>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`About the ${bucketName} bucket`}
            className="text-[#52525B] hover:text-[#71717A] transition-colors"
          />
        }
      >
        <Info className="w-3.5 h-3.5" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" sideOffset={8} collisionPadding={16}>
        {explanation}
      </PopoverContent>
    </Popover>
  );
}
