<script setup lang="ts">
import FeedbackHost from '@shared/ui/feedback/FeedbackHost.vue'
import TabBar from '@shared/ui/TabBar.vue'
</script>

<template>
  <div class="min-h-dvh bg-canvas">
    <!-- Padded for the floating tab bar so the last card is never trapped underneath it. -->
    <main class="mx-auto w-full max-w-md px-4 pb-28">
      <RouterView />
    </main>

    <TabBar />

    <!-- Mounted once at the root so a dialog is never clipped by a scrolling ancestor. -->
    <FeedbackHost />
  </div>
</template>
