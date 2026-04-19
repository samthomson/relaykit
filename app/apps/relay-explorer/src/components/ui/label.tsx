import { Text } from '@mantine/core';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <Text
        component="label"
        ref={ref}
        size="sm"
        fw={500}
        className={cn(className)}
        {...props}
      >
        {children}
      </Text>
    );
  }
);
Label.displayName = 'Label';

export { Label };
