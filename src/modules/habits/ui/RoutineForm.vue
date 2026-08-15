<script setup lang="ts">
import { computed, ref } from 'vue'

import type { PatternName } from '@shared/domain/appearance'
import { todayIn } from '@shared/domain/calendar-date'
import type { HexColour } from '@shared/domain/colour'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { formatTime, parseTime } from '@shared/domain/time-of-day'
import AppearancePicker from '@shared/ui/AppearancePicker.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import { type Habit, isNegative } from '@modules/habits/domain/habit'
import {
  createRoutine,
  MAX_ROUTINE_NAME_LENGTH,
  type Routine,
  routineOf,
} from '@modules/habits/domain/routine'

const props = defineProps<{
  initial?: Routine
  /** Every habit that could join, so the picker can name them. */
  habits: readonly Habit[]
  /** The other routines, which is what makes "already in Morning" answerable. */
  others: readonly Routine[]
  submitLabel: string
  busy: boolean
}>()

const emit = defineEmits<{ submit: [routine: Routine] }>()

const name = ref(props.initial?.name ?? '')
const chosen = ref<Identifier[]>([...(props.initial?.habitIds ?? [])])
/**
 * The hour it usually starts, as the empty string when there is none.
 *
 * An empty `<input type="time">` reads as `''`, which is the shape "no hour" already needs,
 * so the field's own empty state is the model's with nothing to keep in step.
 */
const anchorTime = ref(
  props.initial?.anchorTime === undefined ? '' : formatTime(props.initial.anchorTime),
)

const colour = ref<HexColour | undefined>(props.initial?.colour)
const pattern = ref<PatternName | undefined>(props.initial?.pattern)
const error = ref<string | null>(null)

/**
 * Only habits that can be part of a sequence.
 *
 * A habit you are quitting is never performed and never planned, so putting one in a morning
 * would be describing a step nobody takes.
 */
const available = computed(() => props.habits.filter((habit) => !isNegative(habit)))

/**
 * What each habit is currently part of, so the answer is on the row rather than in a refusal.
 *
 * A habit belongs to one routine at a time, and taking it means taking it from somewhere. The
 * screen says where from before the tap rather than complaining after it.
 */
function heldBy(habitId: Identifier): Routine | undefined {
  const owner = routineOf(props.others, habitId)

  return owner?.id === props.initial?.id ? undefined : owner
}

/** The order they will be performed in, which is the order they were chosen. */
const order = computed(() =>
  chosen.value.flatMap((id) => {
    const habit = available.value.find((candidate) => candidate.id === id)

    return habit ? [habit] : []
  }),
)

function toggle(habitId: Identifier) {
  chosen.value = chosen.value.includes(habitId)
    ? chosen.value.filter((id) => id !== habitId)
    : [...chosen.value, habitId]
}

function move(habitId: Identifier, by: number) {
  const from = chosen.value.indexOf(habitId)
  const to = from + by

  if (from === -1 || to < 0 || to >= chosen.value.length) return

  const next = [...chosen.value]
  const [moved] = next.splice(from, 1)

  if (moved) next.splice(to, 0, moved)

  chosen.value = next
}

function submit() {
  error.value = null

  try {
    // Identity and creation day survive an edit, so a day already lived keeps its shape.
    emit(
      'submit',
      createRoutine({
        id: props.initial?.id ?? newIdentifier(),
        name: name.value,
        habitIds: chosen.value,
        createdOn: props.initial?.createdOn ?? todayIn(),
        ...(anchorTime.value ? { anchorTime: parseTime(anchorTime.value) } : {}),
        archivedOn: props.initial?.archivedOn,
        colour: colour.value,
        pattern: pattern.value,
      }),
    )
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'That routine is not valid.'
  }
}

/** Lets a parent surface a rejection only the stored routines could reveal. */
function reject(message: string) {
  error.value = message
}

defineExpose({ reject })
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <label class="block text-xs font-medium text-ink-muted">
      Name
      <input
        v-model="name"
        type="text"
        required
        :maxlength="MAX_ROUTINE_NAME_LENGTH"
        placeholder="Morning"
        class="mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm font-normal text-ink placeholder:text-ink-subtle"
      />
      <span class="mt-1 block text-[0.625rem] text-ink-subtle">
        A part of the day, not a category. Morning, Deep work, Wind down.
      </span>
    </label>

    <fieldset>
      <legend class="mb-1.5 text-xs font-medium text-ink-muted">In this routine</legend>

      <!--
        The order is the point. A routine is what you do after waking, in the order you do it,
        so the chosen ones are listed in sequence with a way to move them rather than mixed
        back into an alphabetical picker where their order would be invisible.
      -->
      <ol v-if="order.length" class="mb-3 space-y-1.5">
        <li
          v-for="(habit, index) in order"
          :key="habit.id"
          class="flex items-center gap-2 rounded-cell border border-line-strong bg-surface p-2"
          :style="surfaceStyle(habit)"
        >
          <span class="tabular w-5 shrink-0 text-center text-xs text-ink-subtle">
            {{ index + 1 }}
          </span>
          <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ habit.name }}</span>
          <button
            type="button"
            class="hit-area grid size-8 place-items-center rounded-full text-ink-muted disabled:opacity-30"
            :disabled="index === 0"
            :aria-label="`Move ${habit.name} earlier`"
            @click="move(habit.id, -1)"
          >
            <AppIcon name="chevron-left" :size="14" class="-rotate-90" />
          </button>
          <button
            type="button"
            class="hit-area grid size-8 place-items-center rounded-full text-ink-muted disabled:opacity-30"
            :disabled="index === order.length - 1"
            :aria-label="`Move ${habit.name} later`"
            @click="move(habit.id, 1)"
          >
            <AppIcon name="chevron-right" :size="14" class="rotate-90" />
          </button>
          <button
            type="button"
            class="hit-area grid size-8 place-items-center rounded-full text-relapse"
            :aria-label="`Take ${habit.name} out`"
            @click="toggle(habit.id)"
          >
            <AppIcon name="ban" :size="14" />
          </button>
        </li>
      </ol>

      <p
        v-else
        class="mb-3 rounded-cell border border-dashed border-line p-3 text-xs text-ink-muted"
      >
        Nothing in it yet. A routine can be named now and filled later.
      </p>

      <p class="mb-1.5 text-xs font-medium text-ink-muted">Add a habit</p>
      <ul class="flex flex-wrap gap-1.5">
        <li v-for="habit in available" :key="habit.id">
          <button
            v-if="!chosen.includes(habit.id)"
            type="button"
            class="rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-muted"
            @click="toggle(habit.id)"
          >
            {{ habit.name }}
            <!--
              Said before the tap rather than complained about after it: taking a habit means
              taking it from wherever it is, and the only useful form of that sentence names
              the place.
            -->
            <span v-if="heldBy(habit.id)" class="text-ink-subtle">
              · in {{ heldBy(habit.id)?.name }}
            </span>
          </button>
        </li>
      </ul>
      <p v-if="!available.length" class="text-xs text-ink-subtle">
        No habits to arrange yet. Create one first and it will appear here.
      </p>
    </fieldset>

    <!--
      An hour orders the day and labels the heading; it is not a schedule for what is inside.
      Handing it down to every habit in the routine would stack them all on one minute of the
      ruler, and spreading them out needs durations rather than a single time.
    -->
    <label class="block text-xs font-medium text-ink-muted">
      Usually starts
      <span class="font-normal text-ink-subtle">· optional</span>
      <span class="mt-1.5 flex items-center gap-2">
        <input
          v-model="anchorTime"
          type="time"
          aria-label="The time of day this routine usually starts"
          class="tabular flex-1 rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm font-normal text-ink"
        />
        <button
          v-if="anchorTime"
          type="button"
          class="rounded-full border border-line-strong px-3 py-2 text-xs font-medium text-ink-muted"
          @click="anchorTime = ''"
        >
          Clear
        </button>
      </span>
      <span class="mt-1 block text-[0.625rem] text-ink-subtle">
        Puts this part of the day in its place among the others. The habits inside keep their own
        times.
      </span>
    </label>

    <AppearancePicker v-model:colour="colour" v-model:pattern="pattern" />

    <p v-if="error" class="rounded-cell bg-relapse-soft p-3 text-xs text-relapse" role="alert">
      {{ error }}
    </p>

    <div class="flex gap-2 pt-1">
      <RouterLink
        to="/routines"
        class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-medium text-ink-muted"
      >
        Cancel
      </RouterLink>
      <button
        type="submit"
        class="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95 disabled:opacity-60"
        :disabled="busy"
      >
        <AppSpinner v-if="busy" :size="14" label="Saving" />
        {{ submitLabel }}
      </button>
    </div>
  </form>
</template>
