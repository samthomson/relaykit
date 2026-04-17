import { Switch as MantineSwitch, type SwitchProps as MantineSwitchProps } from '@mantine/core';
import * as React from 'react';

type SwitchProps = MantineSwitchProps & {
  onCheckedChange?: (checked: boolean) => void;
};

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ onCheckedChange, ...props }, ref) => {
  return <MantineSwitch ref={ref} onChange={(event) => onCheckedChange?.(event.currentTarget.checked)} {...props} />;
});
Switch.displayName = 'Switch';

export { Switch };
