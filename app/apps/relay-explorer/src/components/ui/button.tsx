import { Button as MantineButton, type ButtonProps as MantineButtonProps } from '@mantine/core';
import * as React from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

export type ButtonProps = Omit<MantineButtonProps, 'variant' | 'size'> & {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
} & Pick<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | 'onClick'
  | 'type'
  | 'disabled'
  | 'children'
  | 'className'
  | 'form'
  | 'name'
  | 'value'
  | 'title'
  | 'aria-label'
>;

const variantMap: Record<ButtonVariant, MantineButtonProps['variant']> = {
  default: 'filled',
  destructive: 'filled',
  outline: 'outline',
  secondary: 'light',
  ghost: 'subtle',
  link: 'subtle',
};

const sizeMap: Record<ButtonSize, MantineButtonProps['size']> = {
  default: 'sm',
  sm: 'xs',
  lg: 'md',
  icon: 'sm',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', color, children, asChild = false, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        className: cn((children.props as { className?: string }).className, className),
        ...props,
      });
    }

    return (
      <MantineButton
        ref={ref}
        radius={0}
        variant={variantMap[variant]}
        size={sizeMap[size]}
        color={variant === 'destructive' ? 'red' : color}
        className={className}
        {...props}
      >
        {children}
      </MantineButton>
    );
  }
);
Button.displayName = 'Button';

export { Button };
export type { ButtonProps as ButtonPropsType };
