import { timeOfDay } from '@shared/domain/time-of-day'

import type { RoutinePreset } from './routine-preset'

/**
 * The routines that ship with the app.
 *
 * Bundled rather than fetched, because offline first cannot have an exception carved into it:
 * a library that needs a connection is a library that, on the phone in your pocket on a
 * train, is not there. A shared or downloadable one can come later.
 *
 * Kept deliberately small and deliberately short. A template nobody finishes teaches nothing,
 * and the most common way to abandon a morning routine is to design a ninety minute one on a
 * Sunday. Each of these is meant to be copied and then argued with — the steps are ordinary
 * habits from the moment they land, so changing one is editing a habit, not editing a
 * template.
 */
export const ROUTINE_PRESETS: readonly RoutinePreset[] = [
  {
    key: 'calm-15',
    name: 'The calm 15',
    summary: 'A quarter of an hour before the day starts asking for things.',
    anchorTime: timeOfDay(7 * 60),
    steps: [
      { name: 'Breathe', durationMinutes: 5 },
      { name: 'Stretch', durationMinutes: 5 },
      { name: 'Plan the day', durationMinutes: 5 },
    ],
  },
  {
    key: 'twenty-twenty-twenty',
    name: '20/20/20',
    summary: 'An hour split three ways: move, reflect, learn.',
    anchorTime: timeOfDay(6 * 60),
    steps: [
      { name: 'Move', durationMinutes: 20 },
      { name: 'Reflect', durationMinutes: 20 },
      { name: 'Read', durationMinutes: 20 },
    ],
  },
  {
    key: 'focused-45',
    name: 'The focused 45',
    // No hour on purpose: a block of deep work is placed where the day has room for it, and
    // stating a time here would be the template guessing at someone's calendar.
    summary: 'One block of real work, with the setting up and putting down included.',
    steps: [
      { name: 'Clear the desk', durationMinutes: 5 },
      { name: 'Deep work', durationMinutes: 35 },
      { name: 'Note where you stopped', durationMinutes: 5 },
    ],
  },
  {
    key: 'wind-down',
    name: 'Wind down',
    summary: 'Closing the day on purpose instead of falling out of it.',
    anchorTime: timeOfDay(21 * 60 + 30),
    steps: [
      { name: 'Tidy one thing', durationMinutes: 10 },
      { name: 'Read', durationMinutes: 20 },
      { name: 'Lights out', durationMinutes: 10 },
    ],
  },
]

/** The total length of a preset, which is the number someone judges it by. */
export function presetMinutes(preset: RoutinePreset): number {
  return preset.steps.reduce((sum, step) => sum + step.durationMinutes, 0)
}
