// Public runtime config. EXPO_PUBLIC_* values are inlined at build time (see scripts/sync-env.mjs).
export const CONFIG = {
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  },
  contactEmail: process.env.EXPO_PUBLIC_CONTACT_EMAIL ?? '',
  /** '1' forces bundled sample data even when Firebase is configured */
  useSampleData: process.env.EXPO_PUBLIC_USE_SAMPLE_DATA === '1',
};

export function firebaseConfigured(c = CONFIG.firebase): boolean {
  return !!(c.apiKey && c.projectId && c.appId);
}
