import { Button, Group } from '@mantine/core';
import * as React from 'react';
import { cn } from '@/lib/utils';

type ToggleGroupCtx = {
  value?: string;
  setValue: (next: string) => void;
};

const ToggleGroupContext = React.createContext<ToggleGroupCtx>({ value: undefined, setValue: () => {} });

const ToggleGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value?: string;
    onValueChange?: (next: string) => void;
    type?: 'single' | 'multiple';
  }
>(({ className, value, onValueChange, children }, ref) => {
  const [internalValue, setInternalValue] = React.useState(value);
  const isControlled = typeof value === 'string';
  const currentValue = isControlled ? value : internalValue;

  const setValue = (next: string) => {
    if (!isControlled) setInternalValue(next);
    onValueChange?.(next);
  };

  return (
    <ToggleGroupContext.Provider value={{ value: currentValue, setValue }}>
      <Group ref={ref} gap="xs" className={cn(className)}>
        {children}
      </Group>
    </ToggleGroupContext.Provider>
  );
});
ToggleGroup.displayName = 'ToggleGroup';

const ToggleGroupItem = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }>(
  ({ className, children, value, ...props }, ref) => {
    const ctx = React.useContext(ToggleGroupContext);
    const active = ctx.value === value;
    return (
      <Button
        ref={ref}
        variant={active ? 'filled' : 'light'}
        className={cn(className)}
        onClick={() => ctx.setValue(value)}
        {...props}
      >
        {children}
      </Button>
    );
  }
);
ToggleGroupItem.displayName = 'ToggleGroupItem';

export { ToggleGroup, ToggleGroupItem };
