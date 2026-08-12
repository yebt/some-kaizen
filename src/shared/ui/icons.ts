import {
  Ban,
  MoreHorizontal,
  ChartNoAxesColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Plus,
  Settings,
  User,
} from 'lucide-vue-next'
import type { Component } from 'vue'

/**
 * The app's icon set, mapped from what an icon *means* here to the Lucide component.
 *
 * The names on the left are the app's vocabulary, not Lucide's. That indirection is the
 * point: changing `chart` from a bar chart to a line chart, or swapping the icon set
 * entirely, happens in this file rather than across every template.
 *
 * Lucide is imported as components rather than from a CDN or an icon font, so the icons are
 * bundled and keep working with no connection, which for this app is the normal case.
 * Naming each import individually keeps the bundle tree-shaken down to only what is used.
 */
export const ICONS = {
  grid: LayoutGrid,
  person: User,
  plus: Plus,
  chart: ChartNoAxesColumn,
  gear: Settings,
  check: Check,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  ban: Ban,
  more: MoreHorizontal,
} satisfies Record<string, Component>

export type IconName = keyof typeof ICONS
