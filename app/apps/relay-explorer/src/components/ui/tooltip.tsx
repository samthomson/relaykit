import { Tooltip as MantineTooltip } from '@mantine/core';
import * as React from 'react';

const TooltipProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

const Tooltip = ({ children, label }: { children: React.ReactNode; label?: React.ReactNode }) => {
  return <MantineTooltip label={label}>{children}</MantineTooltip>;
};

const TooltipTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;

const TooltipContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
