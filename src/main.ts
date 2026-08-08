import '@shared/assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'

import App from '@core/App.vue'
import router from '@core/router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(PiniaColada, {
  queryOptions: {
    // change the stale time for all queries to 0ms
    staleTime: 0,
  },
  mutationOptions: {
    // add global mutation options here
  },
  plugins: [
    // add Pinia Colada plugins here
  ],
})

app.mount('#app')
