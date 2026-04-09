import type { CSSProperties, ReactNode } from 'react';
import { Group, Text, Tooltip, ActionIcon } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { INLINE_TITLE_ROW_H } from './InlineTextEditRow';

const truncatedTitleStyle: CSSProperties = {
  flex: '0 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: INLINE_TITLE_ROW_H,
  display: 'flex',
  alignItems: 'center',
};

export type ServiceHostTitleViewProps = {
  title: string;
  density: 'compact' | 'comfortable';
  domain: any | null | undefined;
  canEditConfig: boolean;
  composeId: string;
  service: any;
  onEditDomain: (composeId: string, domain: any) => void;
  onEditConfig: (service: any) => void;
  rowStyle?: CSSProperties;
  trailing?: ReactNode;
};

export const ServiceHostTitleView = ({
  title,
  density,
  domain,
  canEditConfig,
  composeId,
  service,
  onEditDomain,
  onEditConfig,
  rowStyle,
  trailing,
}: ServiceHostTitleViewProps) => {
  const comfortable = density === 'comfortable';
  const iconPx = comfortable ? 16 : 14;
  const actionSize = comfortable ? 'sm' : 'xs';

  return (
    <Group
      gap={comfortable ? 'xs' : 4}
      wrap="nowrap"
      align="center"
      style={{ minWidth: 0, minHeight: INLINE_TITLE_ROW_H, ...rowStyle }}
    >
      <Text fw={comfortable ? 700 : 600} fz={comfortable ? 'lg' : 'md'} title={title} style={truncatedTitleStyle}>
        {title}
      </Text>
      {domain && (
        <Tooltip label="Edit domain">
          <ActionIcon variant="subtle" size={actionSize} style={{ flexShrink: 0 }} onClick={() => onEditDomain(composeId, domain)} aria-label="Edit domain">
            <IconPencil size={iconPx} />
          </ActionIcon>
        </Tooltip>
      )}
      {!domain && canEditConfig && (
        <Tooltip label="Edit config">
          <ActionIcon variant="subtle" size={actionSize} style={{ flexShrink: 0 }} onClick={() => onEditConfig(service)} aria-label="Edit config">
            <IconPencil size={iconPx} />
          </ActionIcon>
        </Tooltip>
      )}
      {trailing}
    </Group>
  );
};
