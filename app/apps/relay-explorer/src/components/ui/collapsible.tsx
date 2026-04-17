import { Collapse } from '@mantine/core';
import * as React from 'react';

type CollapsibleContextValue = {
  open: boolean;
  onOpenChange?: (next: boolean) => void;
};

const CollapsibleContext = React.createContext<CollapsibleContextValue>({ open: false });

const Collapsible = ({
  open,
  defaultOpen,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (next: boolean) => void;
  children: React.ReactNode;
}) => {
  const [internalOpen, setInternalOpen] = React.useState(Boolean(defaultOpen));
  const isControlled = typeof open === 'boolean';
  const currentOpen = isControlled ? Boolean(open) : internalOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return <CollapsibleContext.Provider value={{ open: currentOpen, onOpenChange: setOpen }}>{children}</CollapsibleContext.Provider>;
};

const CollapsibleTrigger = ({
  asChild,
  children,
  ...props
}: {
  asChild?: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) => {
  const { open, onOpenChange } = React.useContext(CollapsibleContext);
  const handleClick = () => onOpenChange?.(!open);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...props,
      onClick: handleClick,
    });
  }

  return (
    <button type="button" {...props} onClick={handleClick}>
      {children}
    </button>
  );
};

const CollapsibleContent = ({ children, ...props }: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) => {
  const { open } = React.useContext(CollapsibleContext);
  return (
    <Collapse in={open}>
      <div {...props}>{children}</div>
    </Collapse>
  );
};

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
