import type { Persistence } from '@core/persistence'
import type { CalendarDate } from '@shared/domain/calendar-date'
import type { PlannedInstance } from '@modules/planning/domain/planned-instance'
import {
  occurrencesFor,
  type RoutineCascade,
  supersededBy,
} from '@modules/planning/domain/routine-plan'

/**
 * Writes a built routine onto a day.
 *
 * Two writes rather than one, in this order. What the build answers is removed first, and
 * only then is the new plan saved — the other way round leaves a moment where the day holds
 * both the old card and the new one, and a screen reading in between would show the habit
 * twice.
 *
 * Nothing is written for a step that did not fit on the day, and nothing already there for
 * one is removed either. Clearing a plan and putting nothing in its place is destruction
 * dressed as an update, and the screen has already said which steps those are.
 */
export async function buildRoutine(
  persistence: Persistence,
  cascade: RoutineCascade,
  date: CalendarDate,
): Promise<PlannedInstance[]> {
  const existing = await persistence.instances.all()

  for (const stale of supersededBy(existing, cascade, date)) {
    await persistence.instances.remove(stale.id)
  }

  const built = occurrencesFor(cascade, date)

  await persistence.instances.saveAll(built)

  return built
}
