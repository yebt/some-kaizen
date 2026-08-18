<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import ActionSheet, { type SheetAction } from '@shared/ui/ActionSheet.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import BackLink from '@shared/ui/BackLink.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import {
  useChallengeDays,
  useChallenges,
  useDeleteChallenge,
  useSaveChallenge,
} from '@modules/challenges/application/challenge-queries'
import { abandonChallenge, type Challenge, progressOf } from '@modules/challenges/domain/challenge'
import {
  CHALLENGE_PRESETS,
  challengeFromPreset,
  type ChallengePreset,
} from '@modules/challenges/domain/challenge-presets'

/**
 * The programmes, and the ones on offer when there are none.
 *
 * A challenge is a commitment rather than a habit, so this screen is deliberately not part of
 * the daily loop: it is somewhere you go when you decide to start one, and afterwards the day
 * itself carries the ticking.
 */
const router = useRouter()
const feedback = useFeedback()

const { data: challengesData, isLoading } = useChallenges()
const { data: daysData } = useChallengeDays()
const saveChallenge = useSaveChallenge()
const deleteChallenge = useDeleteChallenge()

const today = todayIn()
const challenges = computed(() => challengesData.value ?? [])
const days = computed(() => daysData.value ?? [])

const rows = computed(() =>
  challenges.value.map((challenge) => ({
    challenge,
    progress: progressOf(challenge, days.value, today),
  })),
)

const menuFor = ref<Challenge | null>(null)

const actions = computed<readonly SheetAction[]>(() => [
  {
    key: 'abandon',
    label: 'Give up on it',
    description: 'Stops asking. What you did still happened',
  },
  {
    key: 'delete',
    label: 'Delete',
    description: 'Removes it and every day ticked against it',
    tone: 'danger',
  },
])

async function runAction(key: string) {
  const challenge = menuFor.value

  menuFor.value = null

  if (!challenge) return

  if (key === 'abandon') {
    await saveChallenge.mutateAsync(abandonChallenge(challenge, today))
    feedback.notify(`${challenge.name} given up on`)

    return
  }

  const accepted = await feedback.confirm({
    title: `Delete ${challenge.name}?`,
    message: 'Every day ticked against it goes too. To keep what you did, give up on it instead.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })

  if (!accepted) return

  await deleteChallenge.mutateAsync(challenge.id)
  feedback.notify(`${challenge.name} deleted`)
}

async function start(preset: ChallengePreset) {
  const accepted = await feedback.confirm({
    title: `Start ${preset.name}?`,
    // The rule stated before the commitment, not after the first miss. A programme that
    // explained its punishment only once it had been applied would be a trap.
    message:
      preset.onMiss === 'restart'
        ? `${preset.lengthDays} days of ${preset.tasks.length} things, every day. Miss one and you go back to day one.`
        : `${preset.lengthDays} days of ${preset.tasks.length} things. A missed day is a missed day, not a reset.`,
    confirmLabel: 'Start today',
  })

  if (!accepted) return

  await saveChallenge.mutateAsync(
    challengeFromPreset(preset, {
      id: newIdentifier(),
      newTaskId: newIdentifier,
      startedOn: today,
    }),
  )

  feedback.notify(`${preset.name} started`, 'success')
  await router.push('/')
}
</script>

<template>
  <div class="safe-top">
    <BackLink to="/habits" label="Habits" />

    <header class="pt-2 pb-1">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Challenges</h1>
    </header>
    <p class="pb-4 text-sm text-ink-muted">
      A programme rather than a habit: a fixed length, the same things every day, and days that
      count or do not. Nothing here touches the habits you already track.
    </p>

    <div
      v-if="isLoading && challengesData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading" />
    </div>

    <template v-else>
      <ul v-if="rows.length" class="space-y-2" aria-label="Your programmes">
        <li
          v-for="row in rows"
          :key="row.challenge.id"
          class="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
          :class="row.challenge.abandonedOn !== undefined && 'opacity-60'"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink">{{ row.challenge.name }}</p>
            <p class="tabular text-xs text-ink-muted">
              <template v-if="row.progress.finished">Finished</template>
              <template v-else-if="row.challenge.abandonedOn">
                Given up on day {{ row.progress.completed }}
              </template>
              <template v-else>
                Day {{ row.progress.dayNumber }} of {{ row.challenge.lengthDays }}
              </template>
              <!--
                Said plainly rather than hidden. The restart count is the whole difference
                between this and a streak, and a programme that quietly forgot its restarts
                would be flattering rather than true.
              -->
              <template v-if="row.progress.restarts">
                · restarted {{ row.progress.restarts }}
                {{ row.progress.restarts === 1 ? 'time' : 'times' }}
              </template>
            </p>
          </div>
          <button
            type="button"
            class="hit-area grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-ink-muted"
            :aria-label="`Actions for ${row.challenge.name}`"
            @click="menuFor = row.challenge"
          >
            <AppIcon name="more" :size="16" />
          </button>
        </li>
      </ul>

      <section class="mt-5" aria-labelledby="start-heading">
        <h2
          id="start-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          {{ rows.length ? 'Start another' : 'Start one' }}
        </h2>

        <!--
          Offered above the bundled two rather than below them.

          The presets are the common answers, not the only ones, and a programme somebody was
          given by a coach or wrote for themselves is the same shape — a fixed length, a fixed
          daily set, a rule about missing one. Buried under two cards it reads as a fallback
          for when neither of those fits, which is the wrong way round.
        -->
        <RouterLink
          to="/challenges/new"
          class="mb-2 flex items-center justify-between gap-3 rounded-card border border-dashed border-line-strong p-4 text-sm font-medium text-ink"
        >
          <span>
            Write your own
            <span class="block text-xs font-normal text-ink-muted">
              Your days, your things, your rule about missing one
            </span>
          </span>
          <AppIcon name="chevron-right" :size="16" />
        </RouterLink>

        <ul class="space-y-2">
          <li
            v-for="preset in CHALLENGE_PRESETS"
            :key="preset.key"
            class="rounded-card border border-line bg-surface p-4 shadow-card"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="text-sm font-medium text-ink">{{ preset.name }}</h3>
                <p class="mt-0.5 text-xs text-ink-muted">{{ preset.summary }}</p>
              </div>
              <span class="tabular shrink-0 text-xs text-ink-subtle">
                {{ preset.lengthDays }} days
              </span>
            </div>

            <ul class="mt-3 space-y-1">
              <li v-for="task in preset.tasks" :key="task" class="text-xs text-ink">
                {{ task }}
              </li>
            </ul>

            <button
              type="button"
              class="mt-3 w-full rounded-full border border-line-strong px-4 py-2.5 text-xs font-medium text-ink"
              :aria-label="`Start ${preset.name}`"
              @click="start(preset)"
            >
              Start this
            </button>
          </li>
        </ul>
      </section>
    </template>

    <ActionSheet
      :open="menuFor !== null"
      :title="menuFor?.name ?? ''"
      :actions="actions"
      @select="runAction"
      @dismiss="menuFor = null"
    />
  </div>
</template>
