<script setup lang="ts">
import { computed } from 'vue'

import type { CalendarDate } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import AppIcon from '@shared/ui/AppIcon.vue'
import {
  useChallengeDays,
  useChallenges,
  useTickChallengeDay,
} from '@modules/challenges/application/challenge-queries'
import {
  type Challenge,
  isChallengeActiveOn,
  progressOf,
} from '@modules/challenges/domain/challenge'

/**
 * The programmes being run, ticked on the day they belong to.
 *
 * On the day rather than on a screen of their own, because a checklist you have to go and
 * find is a checklist you stop filling in. The programmes screen is where you start and stop
 * one; this is where you actually do it.
 */
const props = defineProps<{ day: CalendarDate }>()

const { data: challengesData } = useChallenges()
const { data: daysData } = useChallengeDays()
const tick = useTickChallengeDay()

const challenges = computed(() => challengesData.value ?? [])
const days = computed(() => daysData.value ?? [])

/**
 * Only the ones today should still be asking about: not finished, not given up on.
 *
 * Given up on *at all*, rather than given up on before today. `isChallengeActiveOn` counts
 * the day you stop as still active, which is right for judging that day — it is left open
 * rather than failed — but wrong for a checklist. Having just decided to stop, being asked to
 * tick five boxes for the rest of the afternoon is the app not listening.
 */
const running = computed(() =>
  challenges.value
    .filter(
      (challenge) =>
        challenge.abandonedOn === undefined && isChallengeActiveOn(challenge, props.day),
    )
    .map((challenge) => ({
      challenge,
      progress: progressOf(challenge, days.value, props.day),
      record: days.value.find((one) => one.challengeId === challenge.id && one.date === props.day),
    }))
    .filter((row) => !row.progress.finished),
)

function isTicked(challengeId: Identifier, taskId: Identifier): boolean {
  const record = days.value.find((one) => one.challengeId === challengeId && one.date === props.day)

  return record?.completed.includes(taskId) ?? false
}

async function toggle(challenge: Challenge, taskId: Identifier) {
  const record = days.value.find(
    (one) => one.challengeId === challenge.id && one.date === props.day,
  )
  const completed = new Set(record?.completed ?? [])

  if (completed.has(taskId)) completed.delete(taskId)
  else completed.add(taskId)

  await tick.mutateAsync({
    challengeId: challenge.id,
    date: props.day,
    completed: [...completed],
    ...(record === undefined ? {} : { existing: record }),
  })
}
</script>

<template>
  <section v-if="running.length" aria-labelledby="challenge-heading">
    <h2
      id="challenge-heading"
      class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
    >
      Programmes
    </h2>

    <div
      v-for="row in running"
      :key="row.challenge.id"
      class="mb-2 rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <div class="flex items-baseline justify-between gap-2">
        <p class="truncate text-sm font-medium text-ink">{{ row.challenge.name }}</p>
        <p class="tabular shrink-0 text-xs text-ink-muted">
          Day {{ row.progress.dayNumber }} of {{ row.challenge.lengthDays }}
        </p>
      </div>

      <!--
        Said before the day is lost rather than after it. A programme whose punishment only
        appears once it has been applied is a trap, and the whole point of the shape is that
        you know what today costs.
      -->
      <p
        v-if="row.challenge.onMiss === 'restart' && !row.progress.todayComplete"
        class="mt-0.5 text-[0.625rem] text-ink-subtle"
      >
        Every one today, or back to day one.
      </p>

      <ul class="mt-3 space-y-1.5">
        <li v-for="task in row.challenge.tasks" :key="task.id">
          <button
            type="button"
            class="flex w-full items-center gap-2.5 rounded-cell border border-line-strong p-2.5 text-left transition-colors"
            :aria-label="`${task.name}, for ${row.challenge.name}`"
            :aria-pressed="isTicked(row.challenge.id, task.id)"
            @click="toggle(row.challenge, task.id)"
          >
            <span
              class="grid size-6 shrink-0 place-items-center rounded-full border transition-colors"
              :class="
                isTicked(row.challenge.id, task.id)
                  ? 'border-done bg-done text-ink-inverse'
                  : 'border-line-strong text-transparent'
              "
            >
              <AppIcon name="check" :size="14" />
            </span>
            <span
              class="min-w-0 flex-1 truncate text-xs"
              :class="isTicked(row.challenge.id, task.id) ? 'text-ink-subtle' : 'text-ink'"
            >
              {{ task.name }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
