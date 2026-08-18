// @ts-check
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'astro/config'

/**
 * Where the domain lives, seen from here.
 *
 * The rules this site's tools run on are the tracker's own — the same statistics windows, the
 * same weekday breakdown, the same challenge progress — and there is exactly one copy of
 * them. A second copy would be two truths that drift apart in silence, and the version that
 * had the bug fixed would be whichever one somebody happened to remember.
 *
 * Deliberately narrow. Only the domain folders are reachable, never `application` or `ui`, so
 * this site cannot accidentally import a Vue component or a Pinia query and discover it at
 * build time. An import that reaches for one simply does not resolve, which is the difference
 * between a boundary and a note asking people to be careful.
 *
 * The domain modules address each other through these same names, so the aliases have to
 * match the tracker's rather than being whatever reads nicely here.
 */
const domain = (path) => fileURLToPath(new URL(`../tracker/src/${path}`, import.meta.url))

const MODULES = ['block-time', 'challenges', 'data', 'habits', 'planning', 'reminders', 'stats']

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        '@shared/domain': domain('shared/domain'),
        ...Object.fromEntries(
          MODULES.map((name) => [`@modules/${name}/domain`, domain(`modules/${name}/domain`)]),
        ),
      },
    },
  },
})
