<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import FeedbackHost from '@shared/ui/feedback/FeedbackHost.vue'
import TabBar from '@shared/ui/TabBar.vue'
import { useReminderSync } from '@modules/reminders/application/use-reminder-sync'

// Mounted once at the root, so every write anywhere ends up reflected on the phone.
useReminderSync()

const route = useRoute()

/**
 * A form is a place you are already in the middle of leaving.
 *
 * It carries its own Cancel and its own Save, so a tab bar underneath offers a third way out
 * that discards what you typed without saying so. Hiding it also gives a long form back the
 * bottom of the screen, which is where its buttons are.
 */
const isForm = computed(() => /\/(new|edit)$/.test(route.path))
</script>

<template>
  <div class="min-h-dvh bg-canvas">
    <!-- Padded for the floating tab bar so the last card is never trapped underneath it. -->
    <main class="mx-auto w-full max-w-md px-4" :class="isForm ? 'pb-8' : 'pb-28'">
      <RouterView />
    </main>

    <TabBar v-if="!isForm" />

    <!-- Mounted once at the root so a dialog is never clipped by a scrolling ancestor. -->
    <FeedbackHost />
  </div>
</template>
