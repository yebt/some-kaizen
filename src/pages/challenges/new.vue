<script setup lang="ts">
import { useRouter } from 'vue-router'

import BackLink from '@shared/ui/BackLink.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { useSaveChallenge } from '@modules/challenges/application/challenge-queries'
import type { Challenge } from '@modules/challenges/domain/challenge'
import ChallengeForm from '@modules/challenges/ui/ChallengeForm.vue'

/**
 * A programme somebody wrote themselves.
 *
 * The two bundled ones are the common answers, not the only ones. Somebody with a coach, a
 * physio or a rule of their own has the same shape to describe — a fixed length, a fixed
 * daily set, days that count or do not — and offering that shape only in two flavours would
 * make the model narrower than it actually is.
 *
 * No confirmation on the way out, unlike starting a preset. The rule was chosen on this
 * screen and stated beside the switch, so asking again would be asking about something read
 * a moment ago rather than about something newly discovered.
 */
const router = useRouter()
const saveChallenge = useSaveChallenge()
const feedback = useFeedback()

async function create(challenge: Challenge) {
  await saveChallenge.mutateAsync(challenge)
  feedback.notify(`${challenge.name} started`, 'success')
  await router.push('/challenges')
}
</script>

<template>
  <div class="safe-top">
    <BackLink to="/challenges" label="Challenges" />
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Your own challenge</h1>
      <p class="text-sm text-ink-muted">
        A fixed number of days, the same things every day, and what a missed one costs. It starts
        today.
      </p>
    </header>

    <ChallengeForm submit-label="Start it" :busy="saveChallenge.isLoading.value" @submit="create" />
  </div>
</template>
