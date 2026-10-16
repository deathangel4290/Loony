import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.loony.wheels',
  appName: 'Loony Wheels',
  webDir: 'dist',
  backgroundColor: '#1b1f3b',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#1b1f3b',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#1b1f3b',
      showSpinner: false,
    },
  },
};

export default config;
