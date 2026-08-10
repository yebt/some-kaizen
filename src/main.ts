import '@shared/assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'

import App from '@core/App.vue'
import router from '@core/router'
import { createPersistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(PiniaColada, {
  queryOptions: {
    // The only source of truth is a local database, so nothing can go stale behind our
    // back. Refetching on every mount keeps a screen honest after a write with no cost.
    staleTime: 0,
  },
  mutationOptions: {},
  plugins: [],
})

try {
  app.provide(PERSISTENCE_KEY, await createPersistence())
  app.mount('#app')
} catch (error) {
  // Storage can genuinely be unavailable: private browsing, a corrupted database, or a
  // second tab pinning an older schema version. Mounting anyway would leave every screen
  // throwing on setup, so say plainly what happened instead of showing a blank page.
  console.error(error)

  const root = document.querySelector('#app')

  if (root) {
    root.textContent =
      'This app stores your habits on the device, and the local database could not be opened. If you are browsing privately, try a normal window.'
    root.setAttribute(
      'style',
      'padding:2rem;font:16px/1.6 system-ui,sans-serif;max-width:32rem;margin:0 auto',
    )
  }
}
