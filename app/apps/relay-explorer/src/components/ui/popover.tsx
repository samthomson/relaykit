import { Popover as MantinePopover } from '@mantine/core';
import * as React from 'react';

const Popover = ({ children }: { children: React.ReactNode } & Record<string, unknown>) => <MantinePopover>{children}</MantinePopover>;

const PopoverTrigger = ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) => {
  if (asChild && React.isValidElement(children)) {
    return <MantinePopover.Target>{children}</MantinePopover.Target>;
  }
  return (
    <MantinePopover.Target>
      <button type="button">{children}</button>
    </MantinePopover.Target>
  );
};

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'center' | 'end'; sideOffset?: number }
>(({ className, children, ...props }, ref) => {
  return (
    <MantinePopover.Dropdown ref={ref} className={className} {...props}>
      {children}
    </MantinePopover.Dropdown>
  );
});
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverTrigger, PopoverContent };
