# Notices

Some Kaizen is licensed under the **GNU Affero General Public License, version 3 or later**.
The full text is in [LICENSE](LICENSE).

## Why this licence

The project plans a paid sync and hosted backup service. Under the ordinary GPL, running a
modified version as a network service is not distribution, so a closed hosted fork would be
permitted. The Affero clause closes that: anyone who offers this software over a network must
offer its source too.

**Known cost, recorded rather than discovered later.** Apple's App Store terms conflict with
the (A)GPL, so an AGPL-only iOS build could not be distributed there. No iOS build exists
today, and the copyright is held in one place, so relicensing that path later remains possible.

## Third-party material bundled here

| What | Where | Licence |
|---|---|---|
| Archivo (variable) | `apps/landing/public/fonts/archivo-variable.woff2` | SIL Open Font License 1.1 — see `apps/landing/public/fonts/Archivo-OFL.txt` |
| Lucide icons | via `lucide-vue-next` | ISC |
| Vue, Vite, Pinia, Pinia Colada, Astro, Capacitor, Tailwind CSS | `package.json` | MIT, except where each project states otherwise |

The screenshots on the site are of this application, produced by
`apps/tracker/e2e/capture.spec.ts` running against its own bundled demo data. No third-party
imagery is used anywhere.
