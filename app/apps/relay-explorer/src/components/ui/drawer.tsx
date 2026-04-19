import { Drawer as MantineDrawer, Text, Title } from '@mantine/core';
import * as React from 'react';
import { cn } from '@/lib/utils';

type DrawerContextValue = {
  open: boolean;
  setOpen: (next: boolean) => void;
};

const DrawerContext = React.createContext<DrawerContextValue>({ open: false, setOpen: () => {} });

const Drawer = ({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ..._unusedProps
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (next: boolean) => void;
  children: React.ReactNode;
  [key: string]: unknown;
}) => {
  const [internalOpen, setInternalOpen] = React.useState(Boolean(defaultOpen));
  const isControlled = typeof open === 'boolean';
  const currentOpen = isControlled ? Boolean(open) : internalOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return <DrawerContext.Provider value={{ open: currentOpen, setOpen }}>{children}</DrawerContext.Provider>;
};
Drawer.displayName = 'Drawer';

const DrawerTrigger = ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) => {
  const { setOpen } = React.useContext(DrawerContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { onClick: () => setOpen(true) });
  }
  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  );
};

const DrawerPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DrawerOverlay = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

const DrawerClose = ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) => {
  const { setOpen } = React.useContext(DrawerContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { onClick: () => setOpen(false) });
  }
  return (
    <button type="button" onClick={() => setOpen(false)}>
      {children}
    </button>
  );
};

const DrawerContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => {
  const { open, setOpen } = React.useContext(DrawerContext);
  return (
    <MantineDrawer opened={open} onClose={() => setOpen(false)} position="bottom" size="85%" className={className}>
      <div ref={ref} className={cn(className)} {...props}>
        {children}
      </div>
    </MantineDrawer>
  );
});
DrawerContent.displayName = 'DrawerContent';

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn(className)} {...props} />;
DrawerHeader.displayName = 'DrawerHeader';

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn(className)} {...props} />;
DrawerFooter.displayName = 'DrawerFooter';

const DrawerTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => {
  return <Title ref={ref} order={4} className={cn(className)} {...props} />;
});
DrawerTitle.displayName = 'DrawerTitle';

const DrawerDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <Text ref={ref} size="sm" c="dimmed" className={cn(className)} {...props} />
);
DrawerDescription.displayName = 'DrawerDescription';

export { Drawer, DrawerPortal, DrawerOverlay, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription };
