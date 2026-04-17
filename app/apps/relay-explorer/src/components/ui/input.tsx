import { TextInput, type TextInputProps } from '@mantine/core';
import * as React from 'react';

type NativeInputProps = Omit<React.ComponentProps<'input'>, keyof TextInputProps>;
type InputProps = TextInputProps & NativeInputProps;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return <TextInput ref={ref} className={className} {...props} />;
});
Input.displayName = 'Input';

export { Input };
