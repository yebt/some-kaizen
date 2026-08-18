import type { IdeaCategory } from './habit-ideas'

/**
 * The habits the app suggests, for the screen where there are none.
 *
 * Bundled rather than fetched, for the same reason the routine presets are: offline first
 * cannot have an exception carved into it, and the moment this list is most needed is the
 * first launch.
 *
 * Chosen to be small, ordinary and finishable. The failure mode of a list like this is
 * aspiration — "meditate 30 minutes, read 50 pages, run 10km" reads as a description of
 * somebody else, and the honest response to it is to close the app. Every idea here is
 * something a bad week can still contain.
 *
 * Each says *why* rather than only what. "Drink water" is a chore; "the one that makes every
 * other one easier" is a reason, and a reason is what survives the third week.
 */
export const HABIT_IDEAS: readonly IdeaCategory[] = [
  {
    key: 'body',
    name: 'Body',
    ideas: [
      {
        kind: 'measured',
        name: 'Drink water',
        why: 'The one that quietly makes every other one easier.',
        schedule: { period: 'daily', times: 1 },
        unit: 'litres',
        minimum: 1,
        goal: 2,
      },
      {
        kind: 'completed',
        name: 'Walk',
        why: 'Twenty minutes outside does more for a mood than an hour indoors.',
        schedule: { period: 'daily', times: 1 },
        usualDurationMinutes: 20,
      },
      {
        kind: 'completed',
        name: 'Stretch',
        why: 'Five minutes, no equipment, and the one thing a desk takes from you.',
        schedule: { period: 'daily', times: 1 },
        usualDurationMinutes: 5,
      },
      {
        kind: 'completed',
        name: 'Strength',
        // Named days rather than a count: a gym habit that leaves the days open is one you
        // spend the week negotiating with.
        why: 'Three fixed days beats five you renegotiate every morning.',
        schedule: { weekdays: [1, 3, 5] },
        usualDurationMinutes: 45,
      },
    ],
  },
  {
    key: 'mind',
    name: 'Mind',
    ideas: [
      {
        kind: 'completed',
        name: 'Read',
        why: 'Ten pages a day is fifteen books a year, and ten pages is nothing.',
        schedule: { period: 'daily', times: 1 },
        usualDurationMinutes: 20,
      },
      {
        kind: 'completed',
        name: 'Breathe',
        why: 'Five minutes of nothing, on purpose. Harder than it sounds and worth it.',
        schedule: { period: 'daily', times: 1 },
        usualDurationMinutes: 5,
      },
      {
        kind: 'completed',
        name: 'Write three lines',
        why: 'Not a journal. Three lines about the day, so a month is something you can read.',
        schedule: { period: 'daily', times: 1 },
        usualDurationMinutes: 5,
      },
      {
        kind: 'completed',
        name: 'Learn something',
        why: 'A language, an instrument, a subject. The habit is showing up, not the topic.',
        schedule: { period: 'daily', times: 1 },
        usualDurationMinutes: 25,
      },
    ],
  },
  {
    key: 'focus',
    name: 'Focus',
    ideas: [
      {
        kind: 'completed',
        name: 'Deep work',
        why: 'One block nobody is allowed to interrupt, before the day gets a vote.',
        schedule: { weekdays: [1, 2, 3, 4, 5] },
        usualDurationMinutes: 45,
      },
      {
        kind: 'completed',
        name: 'Plan the day',
        why: 'Five minutes at the start buys back an hour of deciding what to do next.',
        schedule: { weekdays: [1, 2, 3, 4, 5] },
        usualDurationMinutes: 5,
      },
      {
        kind: 'completed',
        name: 'Inbox to nothing',
        why: 'Once a day, not seven times. An inbox checked constantly is never empty.',
        schedule: { weekdays: [1, 2, 3, 4, 5] },
        usualDurationMinutes: 15,
      },
      {
        kind: 'completed',
        name: 'Review the week',
        why: 'The only habit that tells you whether the others are working.',
        schedule: { period: 'weekly', times: 1 },
        usualDurationMinutes: 30,
      },
    ],
  },
  {
    key: 'home',
    name: 'Home',
    ideas: [
      {
        kind: 'completed',
        name: 'Tidy one thing',
        why: 'One surface, not the house. A tidy house is a project; this is a habit.',
        schedule: { period: 'daily', times: 1 },
        usualDurationMinutes: 10,
      },
      {
        kind: 'completed',
        name: 'Cook',
        why: 'Twice a week is enough to change what the other five look like.',
        schedule: { period: 'weekly', times: 2 },
        usualDurationMinutes: 40,
      },
      {
        kind: 'completed',
        name: 'Message someone',
        why: 'Friendship is a habit before it is a feeling, and it goes quietly.',
        schedule: { period: 'weekly', times: 2 },
        usualDurationMinutes: 10,
      },
    ],
  },
  {
    key: 'quitting',
    name: 'Quitting',
    ideas: [
      {
        kind: 'negative',
        name: 'Smoking',
        why: 'Marked the morning after, when the answer is actually known.',
      },
      {
        kind: 'negative',
        name: 'Scrolling in bed',
        why: 'The one that costs you the next morning as well as this evening.',
      },
      {
        kind: 'negative',
        name: 'Drinking',
        why: 'Counted as clean days rather than as a streak you can fail.',
      },
    ],
  },
]
