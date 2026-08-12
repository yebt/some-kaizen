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
    LocalNotifications: {
      // Uses the launcher icon until a dedicated monochrome notification icon exists.
      smallIcon: 'ic_stat_icon_config_sample',
    },
  },
}

export default config
