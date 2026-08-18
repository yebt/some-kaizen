/**
 * A worked example with enough history behind it to be worth photographing.
 *
 * The application's own demo data is two weeks old, which is right for somebody trying the app
 * and wrong for a picture of its statistics: a heatmap of a fortnight is a picture of an empty
 * grid, and a weekday breakdown with two answered days correctly refuses to say anything.
 *
 * So this builds five months of plausible history and hands it to the app through its own
 * import, which means every screenshot is still the real application rendering real records
 * through the real readers. Nothing here is drawn.
 *
 * The pattern is deliberately imperfect. A run of unbroken green would be a picture of a
 * product that has never been used by a person, and the weekday breakdown only says something
 * because the weekends in here are genuinely worse than the weekdays.
 */

const UNITS = 1_000

/** Deterministic, so two runs produce the same page and a diff means something changed. */
function shuffleSeed(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

    return state / 4_294_967_296
  }
}

function uuid(index: number): string {
  const hex = index.toString(16).padStart(12, '0')

  return `00000000-0000-4000-8000-${hex}`
}

let minted = 0

function nextId(): string {
  minted += 1

  return uuid(minted)
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shift(from: Date, days: number): Date {
  const next = new Date(from)

  next.setDate(next.getDate() + days)

  return next
}

/** Monday is 1 through Sunday 7, matching the app's own weekday numbering. */
function weekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay()
}

export interface WorkedExample {
  readonly json: string
  readonly today: string
}

export function buildWorkedExample(now: Date = new Date()): WorkedExample {
  minted = 0

  const random = shuffleSeed(20_260_818)
  const today = new Date(now)
  const start = shift(today, -152)

  const meditate = {
    id: nextId(),
    name: 'Meditate',
    polarity: 'positive',
    tracking: 'completed',
    frequency: { period: 'daily', repetitions: 1 },
    createdOn: iso(start),
    usualTime: 420,
    usualDurationMinutes: 20,
    symbol: 'breathe',
  }

  const water = {
    id: nextId(),
    name: 'Drink water',
    polarity: 'positive',
    tracking: 'measured',
    frequency: { period: 'daily', repetitions: 1 },
    measure: { unit: 'litres', minimum: 1, goal: 2 },
    createdOn: iso(start),
    symbol: 'water',
  }

  const read = {
    id: nextId(),
    name: 'Read',
    polarity: 'positive',
    tracking: 'completed',
    frequency: { period: 'daily', repetitions: 1 },
    createdOn: iso(start),
    usualTime: 1_290,
    usualDurationMinutes: 30,
    symbol: 'read',
  }

  const run = {
    id: nextId(),
    name: 'Run',
    polarity: 'positive',
    tracking: 'completed',
    frequency: { period: 'weekly', repetitions: 3 },
    createdOn: iso(start),
    usualDurationMinutes: 40,
    symbol: 'run',
  }

  const stretch = {
    id: nextId(),
    name: 'Stretch',
    polarity: 'positive',
    tracking: 'completed',
    frequency: { period: 'weekly', weekdays: [1, 3, 5] },
    createdOn: iso(start),
    usualDurationMinutes: 10,
    symbol: 'stretch',
  }

  const smoking = {
    id: nextId(),
    name: 'Smoking',
    polarity: 'negative',
    createdOn: iso(start),
    symbol: 'screen',
  }

  const habits = [meditate, water, read, run, stretch, smoking]
  const entries: Record<string, unknown>[] = []

  /*
   * Weekends are worse than weekdays here, and the last fortnight is better than the first
   * month. Both are ordinary and both are what makes the statistics screens say anything: a
   * flat record produces a breakdown that is correct and completely uninformative.
   */
  for (let offset = 152; offset >= 1; offset -= 1) {
    const date = shift(today, -offset)
    const day = weekday(date)
    const recent = offset < 45 ? 0.12 : 0
    const weekend = day >= 6 ? -0.28 : 0

    const chance = (base: number) => random() < base + recent + weekend

    if (chance(0.72)) {
      entries.push({
        id: nextId(),
        habitId: meditate.id,
        kind: 'positive',
        outcome: 'done',
        date: iso(date),
        recordedAt: date.getTime() + 8 * 3_600 * UNITS,
      })
    }

    const litres = random()

    if (litres > 0.2) {
      entries.push({
        id: nextId(),
        habitId: water.id,
        kind: 'positive',
        outcome: litres > 0.45 ? 'done' : 'partial',
        value: litres > 0.45 ? 2 + Math.round(random()) * 0.5 : 1.2,
        date: iso(date),
        recordedAt: date.getTime() + 21 * 3_600 * UNITS,
      })
    }

    if (chance(0.6)) {
      entries.push({
        id: nextId(),
        habitId: read.id,
        kind: 'positive',
        outcome: 'done',
        date: iso(date),
        recordedAt: date.getTime() + 22 * 3_600 * UNITS,
      })
    }

    if ([2, 4, 6].includes(day) && chance(0.66)) {
      entries.push({
        id: nextId(),
        habitId: run.id,
        kind: 'positive',
        outcome: 'done',
        date: iso(date),
        recordedAt: date.getTime() + 19 * 3_600 * UNITS,
      })
    }

    if ([1, 3, 5].includes(day) && chance(0.7)) {
      entries.push({
        id: nextId(),
        habitId: stretch.id,
        kind: 'positive',
        outcome: 'done',
        date: iso(date),
        recordedAt: date.getTime() + 7 * 3_600 * UNITS,
      })
    }

    /*
     * Quitting is judged the morning after, so its entry carries both dates — and yesterday
     * is deliberately left unanswered, because "did you avoid it yesterday" waiting on the
     * screen this morning is the state the shape exists for.
     */
    if (offset === 1) continue

    entries.push({
      id: nextId(),
      habitId: smoking.id,
      kind: 'negative',
      outcome: random() < 0.87 ? 'avoided' : 'relapsed',
      date: iso(date),
      recordedOn: iso(shift(date, 1)),
      recordedAt: shift(date, 1).getTime() + 9 * 3_600 * UNITS,
    })
  }

  const blocks = [
    {
      id: nextId(),
      name: 'Sleep',
      span: { start: 1_380, durationMinutes: 450 },
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      createdOn: iso(start),
    },
    {
      id: nextId(),
      name: 'Work',
      span: { start: 540, durationMinutes: 510 },
      weekdays: [1, 2, 3, 4, 5],
      createdOn: iso(start),
    },
    {
      id: nextId(),
      name: 'Commute',
      span: { start: 1_050, durationMinutes: 45 },
      weekdays: [1, 2, 3, 4, 5],
      createdOn: iso(start),
    },
  ]

  const routines = [
    {
      id: nextId(),
      name: 'Morning',
      habitIds: [meditate.id, stretch.id, water.id],
      createdOn: iso(start),
      anchorTime: 405,
    },
    {
      id: nextId(),
      name: 'Wind down',
      habitIds: [read.id],
      createdOn: iso(start),
      anchorTime: 1_290,
    },
  ]

  const instances = [
    {
      id: nextId(),
      habitId: meditate.id,
      date: iso(today),
      periodKey: iso(today),
      startsAt: 420,
      durationMinutes: 20,
    },
    {
      id: nextId(),
      habitId: stretch.id,
      date: iso(today),
      periodKey: iso(today),
      startsAt: 450,
      durationMinutes: 10,
    },
    {
      id: nextId(),
      habitId: run.id,
      date: iso(today),
      periodKey: weekKey(today),
      startsAt: 1_110,
      durationMinutes: 40,
      reminderMinutesBefore: 10,
    },
    {
      id: nextId(),
      habitId: read.id,
      date: iso(today),
      periodKey: iso(today),
      startsAt: 1_290,
      durationMinutes: 30,
    },
  ]

  const tasks = [
    'Two workouts, one outdoors',
    'Follow a diet, no alcohol',
    'Drink four litres of water',
    'Read ten pages of non-fiction',
    'Take a progress photo',
  ].map((name) => ({ id: nextId(), name }))

  const challengeStart = shift(today, -11)
  const challenge = {
    id: nextId(),
    name: '75 Hard',
    lengthDays: 75,
    tasks,
    startedOn: iso(challengeStart),
    onMiss: 'restart',
  }

  const challengeDays = []

  for (let offset = 11; offset >= 1; offset -= 1) {
    const date = shift(today, -offset)

    challengeDays.push({
      id: nextId(),
      challengeId: challenge.id,
      date: iso(date),
      completed: tasks.map((task) => task.id),
      recordedAt: date.getTime() + 23 * 3_600 * UNITS,
    })
  }

  // Today, part way through, which is the state the screen exists to show.
  challengeDays.push({
    id: nextId(),
    challengeId: challenge.id,
    date: iso(today),
    completed: [tasks[0]!.id, tasks[2]!.id, tasks[3]!.id],
    recordedAt: today.getTime(),
  })

  return {
    today: iso(today),
    json: JSON.stringify(
      {
        format: 'some-kaisen.backup',
        version: 1,
        exportedAt: today.toISOString(),
        dataset: {
          habits,
          entries,
          instances,
          blocks,
          routines,
          challenges: [challenge],
          challengeDays,
        },
      },
      null,
      2,
    ),
  }
}

/** `2026-W34`, matching what the planner writes for a weekly period. */
function weekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() === 0 ? 7 : target.getUTCDay()

  target.setUTCDate(target.getUTCDate() + 4 - day)

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)

  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
