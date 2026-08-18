import { defineConfig, devices } from '@playwright/test'

/**
 * End to end tests, run against the real app in a real browser.
 *
 * These exist for what jsdom cannot see. The unit suite mounts components and is far faster,
 * so a behaviour that a mounted component can prove belongs there, not here. What belongs
 * here is anything that needs a real layout, a real IndexedDB, a real router and a real
 * pointer: the wiring between screens, and the gestures that kept breaking in ways every
 * jsdom test passed through.
 *
 * Each test gets its own browser context, so each starts with an empty database. That is the
 * point rather than a detail: an offline first app is its storage, and a suite that shared
 * one would pass or fail depending on the order it happened to run in.
 */
export default defineConfig({
  testDir: './e2e',
  // Run files in parallel; each context is isolated, so order cannot matter.
  fullyParallel: true,
  /*
   * Capped rather than left to the default half-the-cores.
   *
   * At four workers this suite failed intermittently, and the shape of the failure said what
   * it was: every failure was Firefox, they were contiguous from one test to the last, and
   * each was the app simply never mounting — `#app` empty for thirty seconds with no error
   * on the page, which is not a defect the app can produce, since a storage failure writes a
   * message there. A worker was wedging under memory pressure and never recovering. Two
   * workers ran the whole suite green repeatedly.
   *
   * Fixed here rather than papered over with retries: a test that only passes on the second
   * attempt has told you nothing, and a suite that fails a third of the time is a suite
   * people stop reading.
   */
  workers: 2,
  // A test that only passes on the third attempt is a test that has told you nothing, so
  // retries are off locally. CI keeps one, to separate a real failure from a cold start.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // A phone sized viewport, because every layout decision in this app was made for one.
    viewport: { width: 390, height: 844 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 390, height: 844 } },
    },
  ],
  /*
   * The built app, not the dev server.
   *
   * Costs a build before the suite and is worth it twice over. It tests the artifact that
   * actually ships, and it removes a whole class of failure that belongs to the dev server
   * alone: Vite serves each source file at its own path, and a route file called
   * `[id]/index.vue` becomes a URL with unencoded brackets that Firefox refuses to load. That
   * is a real difference between the two browsers, but it is a difference in the development
   * tooling — the bundle has no such URLs — and a suite that reported it as a product defect
   * would be teaching everyone to ignore Firefox failures.
   *
   * It also removes the cold start: nothing is compiled on demand, so the first screen opens
   * as fast as the hundredth.
   */
  webServer: {
    command: 'bun run build-only && bunx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    /*
     * Never reused, and this is not caution — it is a bug already caught.
     *
     * Reusing whatever answers on the port skips the build in the command above, so the suite
     * quietly tests the bundle from some earlier run. It cost real time here: a deliberately
     * reintroduced defect kept passing, and the tests were the suspect until the stale bundle
     * turned out to be. A suite that can pass against code you are not running is worse than
     * no suite, so every run pays for its own build.
     */
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
