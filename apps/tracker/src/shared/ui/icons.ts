import {
  Ban,
  Armchair,
  BookOpen,
  Brain,
  Coins,
  Dumbbell,
  Footprints,
  GraduationCap,
  House,
  Flag,
  Lightbulb,
  Utensils,
  Users,
  Moon,
  Music,
  PersonStanding,
  Smartphone,
  Droplet,
  PenLine,
  MoreHorizontal,
  Bell,
  ChartNoAxesColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Clock,
  Minus,
  Plus,
  Settings,
  User,
} from 'lucide-vue-next'
import type { Component } from 'vue'

import type { SymbolName } from '@shared/domain/appearance'

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
  minus: Minus,
  clock: Clock,
  chart: ChartNoAxesColumn,
  gear: Settings,
  check: Check,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  ban: Ban,
  more: MoreHorizontal,
  bell: Bell,
  /** An idea, on the screen that offers habits worth considering. */
  idea: Lightbulb,
  /** A programme with an end, on the screen that starts one. */
  flag: Flag,
}

/**
 * The symbol a habit can wear, mapped from what it *means* to the drawing.
 *
 * Kept apart from `ICONS` on purpose. Those are the app's own furniture — a chevron, a gear,
 * a tick — and this is somebody's choice about their own habit. Mixing them would let a
 * redraw of the settings gear silently change what a habit looks like.
 */
export const SYMBOL_ICONS = {
  run: Footprints,
  walk: PersonStanding,
  strength: Dumbbell,
  stretch: Armchair,
  water: Droplet,
  food: Utensils,
  sleep: Moon,
  read: BookOpen,
  write: PenLine,
  learn: GraduationCap,
  breathe: Brain,
  music: Music,
  money: Coins,
  home: House,
  people: Users,
  screen: Smartphone,
} satisfies Record<SymbolName, Component> satisfies Record<string, Component>

export type IconName = keyof typeof ICONS
