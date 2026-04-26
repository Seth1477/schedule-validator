/**
 * firebase-config.js — Construct Check Firebase setup
 *
 * HOW TO ACTIVATE CROSS-DEVICE LOGIN:
 * ─────────────────────────────────────────────────────────────
 * 1. Go to https://console.firebase.google.com/
 * 2. Click "Add project" → name it "construct-check" → Continue
 * 3. Skip Google Analytics → Create project
 * 4. In the left sidebar: Authentication → Get Started
 *    → Sign-in method → Email/Password → Enable → Save
 * 5. Click the gear icon → Project Settings → scroll to
 *    "Your apps" → click the </> (Web) button
 *    → Register app (name it "construct-check") → Continue
 * 6. Copy the firebaseConfig values below from the code shown
 * 7. Replace each "REPLACE_ME" below with your actual values
 * 8. Save this file and push to GitHub — you're done!
 * ─────────────────────────────────────────────────────────────
 * Note: Firebase config keys are safe to commit publicly.
 * Protect data with Firebase Security Rules, not by hiding keys.
 */

window.CC_FIREBASE_CONFIG = {
  apiKey:            'AIzaSyC_fUpvQQW6hyXdjBiBRn6zbiO5tP_kxKs',
  authDomain:        'construct-check-e855d.firebaseapp.com',
  projectId:         'construct-check-e855d',
  storageBucket:     'construct-check-e855d.firebasestorage.app',
  messagingSenderId: '526957791403',
  appId:             '1:526957791403:web:ad1e26269278e1d08f0fee',
};
