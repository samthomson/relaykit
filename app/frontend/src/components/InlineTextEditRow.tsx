import type { CSSProperties, ReactNode } from 'react';
import { Group, TextInput, Tooltip, ActionIcon, rem } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';

/** One shared line height for title / inline edits (avoids vertical jump). */
export const INLINE_TITLE_ROW_H = rem(28);

const compactInlineTextInputProps = {
  size: 'xs' as const,
  styles: {
    input: {
      height: INLINE_TITLE_ROW_H,
      minHeight: INLINE_TITLE_ROW_H,
      paddingTop: rem(2),
      paddingBottom: rem(2),
      paddingLeft: rem(8),
      paddingRight: rem(8),
      lineHeight: rem(22),
      borderColor: 'var(--mantine-color-gray-4)',
    },
  },
};

export type InlineTextEditRowProps = {
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saveDisabled?: boolean;
  autoFocus?: boolean;
  /** Tighter controls on overview cards vs details / modal title. */
  density?: 'compact' | 'comfortable';
  inputStyle?: CSSProperties;
  rowStyle?: CSSProperties;
  /** e.g. status badge after save/cancel on the same row */
  trailing?: ReactNode;
};

export const InlineTextEditRow = ({
  value,
  onChange,
  onSave,
  onCancel,
  saveDisabled = false,
  autoFocus,
  density = 'compact',
  inputStyle,
  rowStyle,
  trailing,
}: InlineTextEditRowProps) => {
  const actionSize = density === 'comfortable' ? 'sm' : 'xs';
  const iconPx = density === 'comfortable' ? 16 : 14;
  const gap = density === 'comfortable' ? 'xs' : 4;

  return (
    <Group gap={gap} wrap="nowrap" align="center" style={{ minHeight: INLINE_TITLE_ROW_H, ...rowStyle }}>
      <TextInput
        {...compactInlineTextInputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !saveDisabled) onSave();
        }}
        style={inputStyle}
        autoFocus={autoFocus}
      />
      <Tooltip label="Save">
        <ActionIcon color="relay-orange" variant="light" size={actionSize} onClick={onSave} disabled={saveDisabled} aria-label="Save">
          <IconCheck size={iconPx} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Cancel">
        <ActionIcon variant="subtle" color="gray" size={actionSize} onClick={onCancel} aria-label="Cancel">
          <IconX size={iconPx} />
        </ActionIcon>
      </Tooltip>
      {trailing}
    </Group>
  );
};
