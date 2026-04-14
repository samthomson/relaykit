import { ActionIcon, type ActionIconProps, Tooltip } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';

type CopyControlProps = Omit<ActionIconProps, 'onClick'> & {
  text: string;
  onCopy: (text: string) => void;
  tooltip?: string;
  iconSize?: number;
};

export const CopyControl = ({
  text,
  onCopy,
  tooltip = 'copy',
  iconSize = 14,
  variant = 'subtle',
  size = 'sm',
  ...props
}: CopyControlProps) => (
  <Tooltip label={tooltip}>
    <ActionIcon variant={variant} size={size} onClick={() => onCopy(text)} {...props}>
      <IconCopy size={iconSize} />
    </ActionIcon>
  </Tooltip>
);
