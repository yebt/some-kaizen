<script setup lang="ts">
import TabBar from '@shared/ui/TabBar.vue'
</script>

<template>
  <div class="min-h-dvh bg-canvas">
    <!-- Padded for the floating tab bar so the last card is never trapped underneath it. -->
    <main class="mx-auto w-full max-w-md px-4 pb-28">
      <RouterView />
    </main>

    <TabBar />
  </div>
</template>
