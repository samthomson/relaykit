import { Alert as MantineAlert, Text } from '@mantine/core';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' }>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <MantineAlert ref={ref} color={variant === 'destructive' ? 'red' : undefined} className={cn(className)} {...props}>
        {children}
      </MantineAlert>
    );
  }
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => {
  return <Text ref={ref} fw={600} className={cn(className)} {...props} />;
});
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn(className)} {...props} />;
});
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
