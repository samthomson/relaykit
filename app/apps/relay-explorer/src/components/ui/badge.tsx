import { Badge as MantineBadge } from '@mantine/core';
import type { ReactNode } from 'react';

export interface BadgeProps {
  className?: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  children?: ReactNode;
}

const Badge = ({ className, variant = 'default', children, ...props }: BadgeProps) => {
  const mantineVariant = variant === 'outline' ? 'outline' : variant === 'secondary' ? 'light' : 'filled';
  const color = variant === 'destructive' ? 'red' : undefined;
  return (
    <MantineBadge className={className} variant={mantineVariant} color={color} {...props}>
      {children}
    </MantineBadge>
  );
};

export { Badge };
