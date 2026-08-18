<script setup lang="ts">
import { computed, ref } from 'vue'

import { todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import {
  type Challenge,
  MAX_CHALLENGE_LENGTH_DAYS,
  MAX_CHALLENGE_NAME_LENGTH,
  MAX_CHALLENGE_TASKS,
  type MissRule,
} from '@modules/challenges/domain/challenge'
import { challengeFromNames } from '@modules/challenges/domain/challenge-draft'

defineProps<{ submitLabel: string; busy: boolean }>()
const emit = defineEmits<{ submit: [challenge: Challenge] }>()

/**
 * Three rows to begin with, and every one of them optional.
 *
 * One row would read as a single field somebody has to discover is a list. Three says list
 * without asking for three things, because the blanks are dropped rather than refused.
 */
const STARTING_ROWS = 3

const name = ref('')
const lengthDays = ref(30)
const onMiss = ref<MissRule>('restart')
const taskNames = ref<string[]>(Array.from({ length: STARTING_ROWS }, () => ''))
const error = ref<string | null>(null)

/** What each rule costs, said beside the switch rather than after the first miss. */
const MISS_RULES: ReadonlyArray<{ value: MissRule; label: string; cost: string }> = [
  {
    value: 'restart',
    label: 'Back to day one',
    cost: 'Miss a day and the run starts again. The days you did still happened.',
  },
  {
    value: 'continue',
    label: 'A missed day is just a missed day',
    cost: 'The run carries on. You finish when you have done enough days.',
  },
]

const filled = computed(() => taskNames.value.filter((task) => task.trim() !== '').length)

/**
 * The commitment read back while it is being written.
 *
 * The whole shape is two numbers and a rule, and stating them plainly is what catches a 30
 * typed where 300 was meant — which a confirmation afterwards catches far too late, because
 * by then it is agreeing to something rather than checking it.
 */
const commitment = computed(() => {
  const days = `${lengthDays.value} ${lengthDays.value === 1 ? 'day' : 'days'}`
  const things = `${filled.value} ${filled.value === 1 ? 'thing' : 'things'}`
  const rule =
    onMiss.value === 'restart'
      ? 'Miss one and you go back to day one.'
      : 'A missed day is a missed day, not a reset.'

  return `${days} of ${things}, every day. ${rule}`
})

/** No guard on the cap: the button that calls this is gone by then, and a second one here
 * would imply otherwise. */
function addRow() {
  taskNames.value = [...taskNames.value, '']
}

function removeRow(index: number) {
  taskNames.value = taskNames.value.filter((_, position) => position !== index)
}

function submit() {
  error.value = null

  try {
    emit(
      'submit',
      challengeFromNames(
        {
          name: name.value,
          lengthDays: lengthDays.value,
          onMiss: onMiss.value,
          taskNames: taskNames.value,
        },
        { id: newIdentifier(), newTaskId: newIdentifier, startedOn: todayIn() },
      ),
    )
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'That challenge is not valid.'
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div>
      <label for="challenge-name" class="mb-1.5 block text-xs font-medium text-ink-muted">
        Name
      </label>
      <input
        id="challenge-name"
        v-model="name"
        type="text"
        :maxlength="MAX_CHALLENGE_NAME_LENGTH"
        placeholder="Winter build"
        class="w-full rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle"
      />
    </div>

    <div>
      <label for="challenge-length" class="mb-1.5 block text-xs font-medium text-ink-muted">
        How many days
      </label>
      <input
        id="challenge-length"
        v-model.number="lengthDays"
        type="number"
        min="1"
        :max="MAX_CHALLENGE_LENGTH_DAYS"
        class="tabular w-full rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink"
      />
    </div>

    <fieldset>
      <legend class="mb-1.5 text-xs font-medium text-ink-muted">Every day, all of these</legend>

      <ul class="space-y-2">
        <li v-for="(task, index) in taskNames" :key="index" data-task-row class="flex gap-2">
          <input
            v-model="taskNames[index]"
            type="text"
            :aria-label="`Thing ${index + 1}`"
            :placeholder="index === 0 ? 'Move for twenty minutes' : ''"
            class="min-w-0 flex-1 rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle"
          />
          <button
            v-if="taskNames.length > 1"
            type="button"
            class="hit-area grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink-subtle"
            :aria-label="`Remove thing ${index + 1}`"
            @click="removeRow(index)"
          >
            <AppIcon name="minus" :size="14" />
          </button>
        </li>
      </ul>

      <button
        v-if="taskNames.length < MAX_CHALLENGE_TASKS"
        type="button"
        class="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-2 text-xs font-medium text-ink-muted"
        aria-label="Add another thing"
        @click="addRow"
      >
        <AppIcon name="plus" :size="14" />
        Add another
      </button>
    </fieldset>

    <fieldset aria-label="What a missed day costs">
      <legend class="mb-1.5 text-xs font-medium text-ink-muted">What a missed day costs</legend>

      <ul class="space-y-2">
        <li v-for="rule in MISS_RULES" :key="rule.value">
          <button
            type="button"
            class="w-full rounded-cell border px-3.5 py-3 text-left"
            :class="
              onMiss === rule.value
                ? 'border-ink bg-surface-sunken text-ink'
                : 'border-line bg-surface text-ink-muted'
            "
            :aria-label="rule.label"
            :aria-pressed="onMiss === rule.value"
            @click="onMiss = rule.value"
          >
            <span class="block text-sm font-medium">{{ rule.label }}</span>
            <span class="block text-xs text-ink-muted">{{ rule.cost }}</span>
          </button>
        </li>
      </ul>
    </fieldset>

    <p data-commitment class="rounded-cell bg-surface-sunken p-3 text-xs text-ink">
      {{ commitment }}
    </p>

    <p v-if="error" role="alert" class="rounded-cell bg-relapse-soft p-3 text-xs text-relapse">
      {{ error }}
    </p>

    <div class="flex gap-2 pt-1">
      <RouterLink
        to="/challenges"
        class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-medium text-ink-muted"
      >
        Cancel
      </RouterLink>
      <button
        type="submit"
        class="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95 disabled:opacity-50"
        :disabled="busy"
      >
        <AppSpinner v-if="busy" :size="14" label="Saving" />
        {{ submitLabel }}
      </button>
    </div>
  </form>
</template>
