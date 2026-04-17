import { Tabs as MantineTabs } from '@mantine/core';
import * as React from 'react';
import { cn } from '@/lib/utils';

type TabsContextValue = {
  value: string;
  setValue: (next: string) => void;
};

const TabsContext = React.createContext<TabsContextValue>({ value: '', setValue: () => {} });

const Tabs = ({
  value,
  defaultValue,
  onValueChange,
  children,
  className,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string) => void;
  children: React.ReactNode;
  className?: string;
}) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? '');
  const isControlled = typeof value === 'string';
  const currentValue = isControlled ? (value as string) : internalValue;

  const setValue = (next: string) => {
    if (!isControlled) setInternalValue(next);
    onValueChange?.(next);
  };

  return (
    <MantineTabs value={currentValue} onChange={(next) => next && setValue(next)} className={cn(className)}>
      <TabsContext.Provider value={{ value: currentValue, setValue }}>{children}</TabsContext.Provider>
    </MantineTabs>
  );
};

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  return <MantineTabs.List ref={ref} className={cn(className)} {...props} />;
});
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }>(
  ({ className, children, value, ...props }, ref) => {
    return (
      <MantineTabs.Tab ref={ref} value={value} className={cn(className)} {...props}>
        {children}
      </MantineTabs.Tab>
    );
  }
);
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value: string }>(
  ({ className, children, value, ...props }, ref) => {
    return (
      <MantineTabs.Panel ref={ref} value={value} className={cn(className)} {...props}>
        {children}
      </MantineTabs.Panel>
    );
  }
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
