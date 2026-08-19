<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { parseTime, spanBetween } from '@shared/domain/time-of-day'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { usePreferences } from '@core/preferences-store'
import { useSaveHabits } from '@modules/habits/application/habit-queries'
import { useSaveBlockTime } from '@modules/block-time/application/block-time-queries'
import { habitFromIdea, type HabitIdea } from '@modules/habits/domain/habit-ideas'
import { HABIT_IDEAS } from '@modules/habits/domain/idea-library'
import { createBlockTime } from '@modules/block-time/domain/block-time'

/**
 * The first minute with the app.
 *
 * Not a carousel. Three slides explaining what a habit tracker is would be tapped through by
 * everybody and remembered by nobody, and this product's own principle is to show the thing
 * rather than describe it. So the first run does not explain anything: it produces a real day
 * with real habits on it, using the same constructors a form uses, and then gets out of the
 * way.
 *
 * Two questions, in the order they matter. The first is the one that stops people — a blank
 * "name a habit" field is a reasonable instruction only for somebody who already knows the
 * answer. The second is the one that makes this app different from the others they have
 * already abandoned: a day has hours that are already spoken for.
 *
 * Everything is skippable and nothing is written until the last press, so backing out at any
 * point leaves exactly the empty app that existed before this screen was built.
 */
const router = useRouter()
const preferences = usePreferences()
const saveHabits = useSaveHabits()
const saveBlock = useSaveBlockTime()

const step = ref<'habits' | 'day'>('habits')
const chosen = ref<string[]>([])
const busy = ref(false)

const sleep = ref({ include: true, from: '23:00', to: '07:00' })
const work = ref({ include: true, from: '09:00', to: '17:30' })

const categories = HABIT_IDEAS

function isChosen(name: string): boolean {
  return chosen.value.includes(name)
}

function toggle(idea: HabitIdea) {
  chosen.value = isChosen(idea.name)
    ? chosen.value.filter((name) => name !== idea.name)
    : [...chosen.value, idea.name]
}

const chosenLabel = computed(() => {
  const count = chosen.value.length

  if (count === 0) return 'Nothing chosen yet — that is fine, you can add one any time'

  return `${count} chosen`
})

/** The blocks the second step would write, built here so an invalid time is caught before it. */
function blocksToWrite() {
  const today = todayIn()
  const drafts = [
    { name: 'Sleep', value: sleep.value, weekdays: [1, 2, 3, 4, 5, 6, 7] as const },
    { name: 'Work', value: work.value, weekdays: [1, 2, 3, 4, 5] as const },
  ]

  return drafts
    .filter((draft) => draft.value.include)
    .map((draft) =>
      createBlockTime({
        id: newIdentifier(),
        name: draft.name,
        span: spanBetween(parseTime(draft.value.from), parseTime(draft.value.to)),
        weekdays: [...draft.weekdays],
        createdOn: today,
      }),
    )
}

/**
 * Marks the device and leaves, whichever way this ended.
 *
 * Skipping is an answer. Asking again tomorrow would be the app refusing to hear no.
 */
async function leave(to = '/') {
  preferences.markStarted()
  await router.replace(to)
}

async function skip() {
  await leave()
}

async function finish() {
  busy.value = true

  try {
    const today = todayIn()
    const habits = categories
      .flatMap((category) => category.ideas)
      .filter((idea) => isChosen(idea.name))
      .map((idea) => habitFromIdea(idea, { id: newIdentifier(), today }))

    const blocks = blocksToWrite()

    if (habits.length) await saveHabits.mutateAsync(habits)

    // One at a time, because the port refuses a block that overlaps one already stored and
    // that check is the whole reason blocks are worth having.
    for (const block of blocks) await saveBlock.mutateAsync(block)

    /*
     * It ends on the day it just gave a shape to, rather than on a summary of it.
     *
     * The two questions above are "what would you like to do" and "when is your day already
     * taken", and the answer to both is a timeline: shaded bands where the sleep and the work
     * are, and the chosen habits waiting for an hour. Ending anywhere else means somebody has
     * described a day and never seen one.
     *
     * The drawer is opened with it, because a habit without an hour draws nothing on the
     * ruler — arriving to sleep and work and no sign of what was just chosen is half a
     * payoff, and the gesture between the two halves is the whole product.
     *
     * Unless nothing was made. An empty timeline is a worse ending than the ordinary home
     * screen, and somebody who chose nothing has nothing to be shown.
     */
    await leave(habits.length || blocks.length ? `/day/${today}?tray=1` : '/')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="safe-top">
    <template v-if="step === 'habits'">
      <header class="pt-2 pb-4">
        <h1 class="text-2xl font-semibold tracking-tight text-ink">
          What would you like to do more often?
        </h1>
        <p class="mt-1 text-sm text-ink-muted">
          Pick as many as you like, or none. Everything here can be changed, renamed or thrown
          away afterwards.
        </p>
      </header>

      <section
        v-for="category in categories"
        :key="category.key"
        class="mb-5"
        :aria-label="category.name"
      >
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {{ category.name }}
        </h2>

        <ul class="space-y-2">
          <li v-for="idea in category.ideas" :key="idea.name">
            <button
              type="button"
              class="flex w-full items-start gap-3 rounded-card border p-4 text-left transition-colors"
              :class="
                isChosen(idea.name)
                  ? 'border-ink bg-surface-sunken'
                  : 'border-line bg-surface shadow-card'
              "
              :aria-label="`Add ${idea.name}`"
              :aria-pressed="isChosen(idea.name)"
              @click="toggle(idea)"
            >
              <span
                class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border"
                :class="isChosen(idea.name) ? 'border-ink bg-ink text-ink-inverse' : 'border-line-strong'"
              >
                <AppIcon v-if="isChosen(idea.name)" name="check" :size="12" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium text-ink">{{ idea.name }}</span>
                <span class="mt-0.5 block text-xs text-ink-muted">{{ idea.why }}</span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <div class="sticky bottom-0 -mx-4 bg-canvas/95 px-4 pt-3 pb-2 backdrop-blur">
        <p class="mb-2 text-xs text-ink-subtle">{{ chosenLabel }}</p>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium text-ink-muted"
            @click="skip"
          >
            Skip
          </button>
          <button
            type="button"
            class="flex-1 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95"
            @click="step = 'day'"
          >
            Next
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <header class="pt-2 pb-4">
        <h1 class="text-2xl font-semibold tracking-tight text-ink">
          When is your day already spoken for?
        </h1>
        <!--
          The one thing that makes this app different from the ones somebody has already given
          up on, asked in the plainest way it can be asked. Nothing is planned against an
          empty grid here, so the day needs its shape before anything is put on it.
        -->
        <p class="mt-1 text-sm text-ink-muted">
          Habits get placed on real hours, so the day needs to know which ones are already
          taken. These are only a starting point.
        </p>
      </header>

      <ul class="space-y-3">
        <li
          v-for="entry in [
            { key: 'sleep', label: 'Sleep', model: sleep, when: 'Every day' },
            { key: 'work', label: 'Work', model: work, when: 'Monday to Friday' },
          ]"
          :key="entry.key"
          class="rounded-card border border-line bg-surface p-4 shadow-card"
          :class="!entry.model.include && 'opacity-60'"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-medium text-ink">{{ entry.label }}</p>
              <p class="text-xs text-ink-muted">{{ entry.when }}</p>
            </div>
            <button
              type="button"
              class="hit-area shrink-0 rounded-full border border-line-strong px-3.5 py-2 text-xs font-medium text-ink-muted"
              :aria-label="
                entry.model.include ? `Do not add ${entry.label}` : `Add ${entry.label}`
              "
              @click="entry.model.include = !entry.model.include"
            >
              {{ entry.model.include ? 'Remove' : 'Add' }}
            </button>
          </div>

          <div v-if="entry.model.include" class="mt-3 flex items-end gap-2">
            <label class="flex-1 text-xs font-medium text-ink-muted">
              From
              <input
                v-model="entry.model.from"
                type="time"
                :aria-label="`${entry.label} starts at`"
                class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
              />
            </label>
            <label class="flex-1 text-xs font-medium text-ink-muted">
              To
              <input
                v-model="entry.model.to"
                type="time"
                :aria-label="`${entry.label} ends at`"
                class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
              />
            </label>
          </div>
        </li>
      </ul>

      <p class="mt-3 text-xs text-ink-subtle">
        An end earlier than the start means the next morning, so sleep runs 23:00 to 07:00.
      </p>

      <div class="mt-6 flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium text-ink-muted"
          @click="step = 'habits'"
        >
          Back
        </button>
        <button
          type="button"
          class="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95 disabled:opacity-50"
          :disabled="busy"
          @click="finish"
        >
          <AppSpinner v-if="busy" :size="14" label="Setting up" />
          Finish
        </button>
      </div>
    </template>
  </div>
</template>
