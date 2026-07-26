import { ActionIcon, Button, Group, Menu, Text, Tooltip, rem } from '@mantine/core'
import type { ButtonProps, MenuProps } from '@mantine/core'
import type { ReactNode } from 'react'

/** Inline chevron/check so the shared package stays free of icon dependencies. */
const Chevron = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const Check = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export type DropdownItem =
  | {
      id: string
      label: ReactNode
      onSelect?: () => void
      /** renders the item as a link (opens in a new tab) */
      href?: string
      color?: string
      /** highlighted with a check — for pick-one dropdowns */
      active?: boolean
      disabled?: boolean
      /** keep the menu open on click (e.g. inline switches) */
      closeOnClick?: boolean
    }
  | { id: string; divider: true }

type Props = {
  /** trigger content (text or a richer node) */
  children: ReactNode
  items: DropdownItem[]
  /**
   * Split mode: clicking the label follows this link and only the caret opens the menu.
   * Without it the whole button is the menu trigger.
   */
  primaryHref?: string
  onPrimaryClick?: () => void
  /** icon-only chevron trigger for tight rows; children then only feeds the tooltip */
  iconOnly?: boolean
  tooltip?: string
  size?: ButtonProps['size']
  variant?: ButtonProps['variant']
  color?: ButtonProps['color']
  disabled?: boolean
  position?: MenuProps['position']
  menuWidth?: MenuProps['width']
  buttonProps?: ButtonProps
}

/** The one dropdown pattern for relaykit and its apps: mono items, check on active, red for danger. */
export const DropdownButton = ({
  children,
  items,
  primaryHref,
  onPrimaryClick,
  iconOnly,
  tooltip,
  size = 'xs',
  variant = 'light',
  color,
  disabled,
  position = 'bottom-end',
  menuWidth,
  buttonProps,
}: Props) => {
  const dropdown = (
    <Menu.Dropdown>
      {items.map((item) =>
        'divider' in item ? (
          <Menu.Divider key={item.id} />
        ) : (
          <Menu.Item
            key={item.id}
            component={item.href ? 'a' : undefined}
            {...(item.href ? { href: item.href, target: '_blank', rel: 'noreferrer' } : {})}
            ff="monospace"
            fz={rem(12)}
            c={item.active ? 'var(--mantine-primary-color-filled)' : item.color}
            fw={item.active ? 700 : undefined}
            rightSection={item.active ? <Check /> : undefined}
            disabled={item.disabled}
            closeMenuOnClick={item.closeOnClick !== false}
            onClick={item.onSelect}
          >
            {typeof item.label === 'string' ? <Text size="xs" ff="monospace">{item.label}</Text> : item.label}
          </Menu.Item>
        ),
      )}
    </Menu.Dropdown>
  )

  if (iconOnly) {
    return (
      <Menu shadow="md" position={position} width={menuWidth}>
        <Menu.Target>
          <Tooltip label={tooltip ?? children} position="bottom" disabled={!tooltip && typeof children !== 'string'}>
            <ActionIcon variant="subtle" color="gray" size="sm" disabled={disabled} aria-label={tooltip ?? 'actions'}>
              <Chevron size={14} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        {dropdown}
      </Menu>
    )
  }

  if (primaryHref || onPrimaryClick) {
    return (
      <Group gap={0} wrap="nowrap">
        <Button
          component={primaryHref ? 'a' : 'button'}
          {...(primaryHref ? { href: primaryHref, target: '_blank', rel: 'noreferrer' } : {})}
          onClick={onPrimaryClick}
          size={size}
          variant={variant}
          color={color}
          disabled={disabled}
          ff="monospace"
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          {...buttonProps}
        >
          {children}
        </Button>
        <Menu shadow="md" position={position} width={menuWidth}>
          <Menu.Target>
            <Button
              size={size}
              variant={variant}
              color={color}
              disabled={disabled}
              px={6}
              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: '1px solid var(--mantine-color-body)' }}
              aria-label="more options"
            >
              <Chevron />
            </Button>
          </Menu.Target>
          {dropdown}
        </Menu>
      </Group>
    )
  }

  return (
    <Menu shadow="md" position={position} width={menuWidth}>
      <Menu.Target>
        <Button
          size={size}
          variant={variant}
          color={color}
          disabled={disabled}
          ff="monospace"
          rightSection={<Chevron />}
          {...buttonProps}
        >
          {children}
        </Button>
      </Menu.Target>
      {dropdown}
    </Menu>
  )
}
