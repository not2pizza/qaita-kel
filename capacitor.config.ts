import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.antigravity.coffee',
  appName: 'Antigravity Coffee',
  webDir: 'dist',
  ios: {
    // Let the web app own the full screen (we handle safe areas in CSS).
    contentInset: 'never',
    backgroundColor: '#f7f9fa',
  },
};

export default config;
