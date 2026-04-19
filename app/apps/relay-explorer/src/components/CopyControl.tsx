import { ActionIcon, CopyButton } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';

type CopyControlProps = {
  value: string;
  label: string;
};

export const CopyControl = ({ value, label }: CopyControlProps) => (
  <CopyButton value={value} timeout={1200}>
    {({ copied, copy }) => (
      <ActionIcon
        variant="subtle"
        color={copied ? 'green' : 'gray'}
        size="sm"
        radius={0}
        onClick={copy}
        aria-label={label}
      >
        {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
      </ActionIcon>
    )}
  </CopyButton>
);
