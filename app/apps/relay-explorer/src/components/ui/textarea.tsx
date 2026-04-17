import { Textarea as MantineTextarea, type TextareaProps as MantineTextareaProps } from '@mantine/core';
import * as React from 'react';

export type TextareaProps = MantineTextareaProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return <MantineTextarea ref={ref} className={className} {...props} />;
});
Textarea.displayName = 'Textarea';

export { Textarea };
