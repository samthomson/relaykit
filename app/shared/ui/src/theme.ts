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
