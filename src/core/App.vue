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
 * Screens that carry their own way out, and are worse for a tab bar underneath.
 *
 * A form has its own Cancel and its own Save, so a third exit that discards what you typed
 * without saying so is a trap. The day timeline is the other kind: a full height working
 * surface where the bar covers the last two hours of the day and competes for the same
 * corner as the drawer of unplaced habits. Both put a back control beside their title
 * instead, which is a way out you can see rather than one you have to know about.
 */
const isImmersive = computed(
  () => /\/(new|edit)$/.test(route.path) || route.path.startsWith('/day/'),
)
</script>

<template>
  <div class="min-h-dvh bg-canvas">
    <!-- Padded for the floating tab bar so the last card is never trapped underneath it. -->
    <!--
      `safe-bottom` on every screen, not only the ones with a floating bar.

      Hiding the tab bar took the clearance with it, and a form's Save sat exactly where the
      phone draws its own buttons. The inset is what the device says it needs; the extra is
      for the floating bar, when there is one.
    -->
    <main class="safe-bottom mx-auto w-full max-w-md px-4" :class="isImmersive ? 'pb-8' : 'pb-28'">
      <RouterView />
    </main>

    <TabBar v-if="!isImmersive" />

    <!-- Mounted once at the root so a dialog is never clipped by a scrolling ancestor. -->
    <FeedbackHost />
  </div>
</template>
