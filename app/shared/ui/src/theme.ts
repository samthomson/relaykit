import { createTheme, type MantineColorsTuple, type MantineThemeOverride } from '@mantine/core'
import { APP_ACCENTS, RELAYKIT_BRAND } from './colors'

export type RelaykitThemeOptions = {
  primaryColor?: string
  extraColors?: Record<string, MantineColorsTuple>
}

const MONOSPACE =
  '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

export const buildRelaykitTheme = (options: RelaykitThemeOptions = {}): MantineThemeOverride =>
  createTheme({
    primaryColor: options.primaryColor ?? 'relaykit',
    defaultRadius: 0,
    colors: {
      relaykit: RELAYKIT_BRAND,
      relayExplorer: APP_ACCENTS.relayExplorer,
      blossomExplorer: APP_ACCENTS.blossomExplorer,
      nsiteExplorer: APP_ACCENTS.nsiteExplorer,
      ...options.extraColors,
    },
    fontFamily: MONOSPACE,
    components: {
      Badge: {
        defaultProps: { radius: 0 },
        styles: { root: { textTransform: 'none' } },
      },
      Pill: {
        defaultProps: { radius: 0, size: 'md' },
        styles: {
          root: {
            background: 'var(--mantine-primary-color-filled)',
            border: '1px solid var(--mantine-primary-color-filled)',
            color: 'var(--mantine-primary-color-contrast)',
            fontFamily: MONOSPACE,
            fontWeight: 600,
          },
          remove: {
            color: 'inherit',
          },
        },
      },
      PillsInput: {
        defaultProps: { radius: 0, size: 'md' },
      },
      Notification: {
        defaultProps: { radius: 0, color: options.primaryColor ?? 'relaykit', withBorder: true },
      },
      SegmentedControl: {
        defaultProps: { color: options.primaryColor ?? 'relaykit' },
      },
      NavLink: {
        defaultProps: { variant: 'light', color: options.primaryColor ?? 'relaykit' },
      },
    },
  })
