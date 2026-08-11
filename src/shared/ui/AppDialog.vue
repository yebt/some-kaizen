<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ open: boolean; label: string }>()
const emit = defineEmits<{ dismiss: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)

/**
 * Uses the platform's own modal, not a hand rolled overlay.
 *
 * `showModal` puts the element in the browser's top layer and gives us focus trapping,
 * inert background content, Esc handling and correct accessibility semantics for free.
 * Reimplementing those on a div is how modals end up letting a screen reader wander into
 * the page behind them.
 *
 * The guard exists because jsdom ships `HTMLDialogElement` without `showModal`, so the
 * fallback only ever runs under test, where the attribute is enough to render the content.
 */
function show() {
  const element = dialog.value

  if (!element) return

  if (typeof element.showModal === 'function') {
    if (!element.open) element.showModal()

    return
  }

  element.setAttribute('open', '')
}

function hide() {
  const element = dialog.value

  if (!element) return

  if (typeof element.close === 'function') {
    if (element.open) element.close()

    return
  }

  element.removeAttribute('open')
}

watch(
  () => props.open,
  (isOpen) => (isOpen ? show() : hide()),
  { flush: 'post' },
)

onBeforeUnmount(hide)
</script>

<template>
  <dialog
    ref="dialog"
    class="w-full max-w-sm rounded-sheet border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-black/40 backdrop:backdrop-blur-sm open:flex open:flex-col sm:m-auto"
    :aria-label="label"
    @close="emit('dismiss')"
    @cancel.prevent="emit('dismiss')"
  >
    <div class="p-5">
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
/*
 * Bottom sheet on a phone, centred card on anything wider. Reaching for the bottom of the
 * screen is the only comfortable one handed gesture, and this is a mobile first app.
 */
dialog {
  margin: auto auto 0;
  width: 100%;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

@media (min-width: 640px) {
  dialog {
    margin: auto;
    border-radius: var(--radius-sheet);
  }
}
</style>
