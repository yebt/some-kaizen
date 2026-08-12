import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.procyonlotor.somekaisen',
  appName: 'Some Kaisen',
  webDir: 'dist',
  android: {
    // The web layer is the app, so a failed asset is a bug rather than something to hide.
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SplashScreen: {
      /*
       * Hidden by the app itself, once the database is open and the first screen has
       * rendered. A timed splash either lies about being ready or wastes the time it was
       * given, and this app genuinely has something to wait for: IndexedDB opens
       * asynchronously and every screen is empty until it does.
       */
      launchAutoHide: true,
      /*
       * A dead man's switch, not the intended duration. If the hide call never runs — a
       * failed import, a crash before mount — the splash still lifts instead of leaving a
       * picture of the app where the app should be.
       */
      launchShowDuration: 3000,
      backgroundColor: '#f2f0ec',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      // Nothing spins: the wait is short and a spinner over a logo is two things saying the
      // same thing, one of them badly.
      showSpinner: false,
    },
    LocalNotifications: {
      // Uses the launcher icon until a dedicated monochrome notification icon exists.
      smallIcon: 'ic_stat_icon_config_sample',
    },
  },
}

export default config
