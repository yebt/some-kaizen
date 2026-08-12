<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  addDays,
  type CalendarDate,
  calendarDate,
  eachDayBetween,
  endOfWeek,
  startOfWeek,
  toDate,
  todayIn,
  weekday,
} from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { usePreferences } from '@core/preferences-store'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import DragGhost from '@shared/ui/drag/DragGhost.vue'
import DraggableItem from '@shared/ui/drag/DraggableItem.vue'
import { useDragAndDrop } from '@shared/ui/drag/use-drag-and-drop'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { isPositive, type PositiveHabit } from '@modules/habits/domain/habit'
import { useHabits } from '@modules/habits/application/habit-queries'
import { remainingPlacementsAcross } from '@modules/planning/domain/placement-plan'
import { moveToDate, planInstance, spanOf } from '@modules/planning/domain/planned-instance'
import {
  usePlannedInstances,
  useRemoveInstance,
  useSaveInstance,
} from '@modules/planning/application/planning-queries'

/** What a finger is carrying: a brand new occurrence, or one already on the board. */
type DragPayload =
  | { kind: 'create'; habit: PositiveHabit }
  | { kind: 'move'; instanceId: Identifier; habit: PositiveHabit }

const { data: habitsData, isLoading: habitsLoading } = useHabits()
const { data: instancesData } = usePlannedInstances()
const saveInstance = useSaveInstance()
const removeInstance = useRemoveInstance()
const feedback = useFeedback()
const preferences = usePreferences()

const habits = computed(() => habitsData.value ?? [])
const instances = computed(() => instancesData.value ?? [])
const positiveHabits = computed(() => habits.value.filter(isPositive))

const weekAnchor = ref<CalendarDate>(todayIn())
const weekDays = computed(() =>
  eachDayBetween(startOfWeek(weekAnchor.value), endOfWeek(weekAnchor.value)),
)

const rangeLabel = computed(() => {
  const formatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
  const first = weekDays.value.at(0)
  const last = weekDays.value.at(-1)

  if (!first || !last) return ''

  return `${formatter.format(toDate(first))} – ${formatter.format(toDate(last))}`
})

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Habits still owing occurrences somewhere in the visible week. */
const tray = computed(() =>
  positiveHabits.value
    .map((habit) => ({
      habit,
      remaining: remainingPlacementsAcross(habit, instances.value, weekDays.value),
    }))
    .filter((entry) => entry.remaining > 0),
)

const habitsById = computed(() => new Map(positiveHabits.value.map((habit) => [habit.id, habit])))

const rows = computed(() =>
  weekDays.value.map((day) => ({
    day,
    label: WEEKDAY_LABELS[weekday(day) - 1] ?? '',
    number: toDate(day).getDate(),
    isToday: day === todayIn(),
    placed: instances.value
      .filter((instance) => instance.date === day)
      .flatMap((instance) => {
        const habit = habitsById.value.get(instance.habitId)

        // An occurrence whose habit no longer exists cannot be planned or moved, so it is
        // not drawn. Deleting a habit should take its occurrences with it; until the delete
        // flow exists there is nothing to cascade from.
        if (!habit) return []

        const span = spanOf(instance)

        return [
          {
            instance,
            habit,
            time: span ? preferences.formatClock(span.start) : undefined,
          },
        ]
      }),
  })),
)

const drag = useDragAndDrop<DragPayload>({
  onDrop: handleDrop,
  keyOf: (payload) =>
    payload.kind === 'create' ? `new:${payload.habit.id}` : `move:${payload.instanceId}`,
})

/** True only for the card the finger is actually on, so the list does not animate at once. */
function pressState(key: string) {
  return {
    pending: drag.isPending.value && drag.pressedKey.value === key,
    dragging: drag.isDragging.value && drag.pressedKey.value === key,
  }
}

const ghostLabel = computed(() => drag.payload.value?.habit.name ?? '')

async function handleDrop(payload: DragPayload, zone: string) {
  const date = calendarDate(zone)

  if (payload.kind === 'create') {
    await saveInstance.mutateAsync(
      planInstance({
        id: newIdentifier(),
        habitId: payload.habit.id,
        date,
        period: payload.habit.frequency.period,
      }),
    )
    feedback.notify(`${payload.habit.name} placed`, 'success')

    return
  }

  const existing = instances.value.find((instance) => instance.id === payload.instanceId)

  // Dropping a card back where it started is a no-op, not a move that clears its time.
  if (!existing || existing.date === date) return

  await saveInstance.mutateAsync(moveToDate(existing, date, payload.habit.frequency.period))
  feedback.notify(`${payload.habit.name} moved`, 'success')
}

async function unplace(instanceId: Identifier, name: string) {
  const accepted = await feedback.confirm({
    title: `Remove ${name}?`,
    message: 'The occurrence goes back to the tray. Nothing you have already logged is lost.',
    confirmLabel: 'Remove',
    tone: 'danger',
  })

  if (!accepted) return

  await removeInstance.mutateAsync(instanceId)
}

function shiftWeek(offset: number) {
  weekAnchor.value = addDays(weekAnchor.value, offset * 7)
}
</script>

<template>
  <div class="safe-top">
    <header class="flex items-baseline justify-between pt-2 pb-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-ink">Plan</h1>
        <p class="text-sm text-ink-muted">{{ rangeLabel }}</p>
      </div>
      <div class="flex gap-1">
        <button
          type="button"
          class="grid size-8 place-items-center rounded-full border border-line text-ink-muted transition-colors hover:text-ink"
          aria-label="Previous week"
          @click="shiftWeek(-1)"
        >
          <AppIcon name="chevron-left" :size="16" />
        </button>
        <button
          type="button"
          class="grid size-8 place-items-center rounded-full border border-line text-ink-muted transition-colors hover:text-ink"
          aria-label="Next week"
          @click="shiftWeek(1)"
        >
          <AppIcon name="chevron-right" :size="16" />
        </button>
      </div>
    </header>

    <div
      v-if="habitsLoading && habitsData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading your plan" />
    </div>

    <template v-else>
      <section aria-labelledby="tray-heading">
        <h2
          id="tray-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          To place
        </h2>

        <ul v-if="tray.length" class="flex flex-wrap gap-2">
          <li v-for="entry in tray" :key="entry.habit.id">
            <DraggableItem
              v-bind="pressState(`new:${entry.habit.id}`)"
              @press="drag.press({ kind: 'create', habit: entry.habit }, $event)"
              @move="drag.move($event)"
              @release="drag.release($event)"
              @cancel="drag.cancel()"
            >
              <span
                class="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink shadow-card transition-transform active:scale-95"
                :style="surfaceStyle(entry.habit)"
              >
                {{ entry.habit.name }}
                <span class="tabular rounded-full bg-black/15 px-1.5 py-0.5">
                  {{ entry.remaining }}
                </span>
              </span>
            </DraggableItem>
          </li>
        </ul>
        <p
          v-else
          class="rounded-card border border-dashed border-line p-4 text-center text-xs text-ink-muted"
        >
          Every habit has its days this week. Nothing left to place.
        </p>
      </section>

      <section class="mt-5 space-y-2" aria-labelledby="week-heading">
        <h2
          id="week-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          This week
        </h2>

        <div
          v-for="row in rows"
          :key="row.day"
          :data-drop-zone="row.day"
          class="flex gap-3 rounded-card border p-3 transition-colors"
          :class="
            drag.activeZone.value === row.day && drag.isDragging.value
              ? 'border-ink bg-accent'
              : row.isToday
                ? 'border-line-strong bg-surface'
                : 'border-line bg-surface'
          "
        >
          <div class="w-10 shrink-0 text-center">
            <p class="text-[0.6875rem] font-medium text-ink-muted">{{ row.label }}</p>
            <p
              class="tabular text-lg font-semibold"
              :class="row.isToday ? 'text-ink' : 'text-ink-muted'"
            >
              {{ row.number }}
            </p>
          </div>

          <ul v-if="row.placed.length" class="flex min-h-10 flex-1 flex-wrap items-center gap-1.5">
            <li v-for="item in row.placed" :key="item.instance.id">
              <span
                class="flex items-center gap-1 rounded-full bg-surface-sunken py-1 pr-1 pl-2.5 text-xs font-medium text-ink"
                :style="surfaceStyle(item.habit)"
              >
                <DraggableItem
                  v-bind="pressState(`move:${item.instance.id}`)"
                  @press="
                    drag.press(
                      { kind: 'move', instanceId: item.instance.id, habit: item.habit },
                      $event,
                    )
                  "
                  @move="drag.move($event)"
                  @release="drag.release($event)"
                  @cancel="drag.cancel()"
                >
                  <span class="cursor-grab">
                    {{ item.habit.name }}
                    <span v-if="item.time" class="tabular text-ink-muted">· {{ item.time }}</span>
                  </span>
                </DraggableItem>
                <button
                  type="button"
                  class="grid size-5 place-items-center rounded-full text-ink-subtle transition-colors hover:text-relapse"
                  :aria-label="`Remove ${item.habit.name} from ${row.label}`"
                  @click="unplace(item.instance.id, item.habit.name)"
                >
                  <AppIcon name="ban" :size="12" />
                </button>
              </span>
            </li>
          </ul>
          <p v-else class="flex min-h-10 flex-1 items-center text-xs text-ink-subtle">
            Drop a habit here
          </p>
        </div>
      </section>
    </template>

    <DragGhost v-if="drag.isDragging.value" :position="drag.position.value" :label="ghostLabel" />
  </div>
</template>
