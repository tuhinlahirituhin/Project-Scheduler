/* Site settings you can change without touching the rest of the code. */
window.PS_CONFIG = {
  appName: 'Planline',

  // Advertising. Leave enabled: false until your Google AdSense account is approved.
  // Then set enabled: true, paste your publisher id (ca-pub-...) and the slot ids AdSense gives you.
  ads: {
    enabled: false,
    adsenseClient: '',          // e.g. 'ca-pub-1234567890123456'
    slots: { top: '', bottom: '', content: '' },   // content: ad unit shown on the guide pages
  },

  // Accounts: visitors can sign in with an emailed link (or Google) and have their projects saved to
  // their account, so they open on any device. Leave enabled: false until the Firebase project is set up
  // (step by step in firebase/README.md), then paste the firebaseConfig values and set enabled: true.
  // These values are public by design; the security rules in firebase/firestore.rules protect the data.
  cloud: {
    enabled: true,
    firebase: {
      apiKey: 'AIzaSyCfGe89v8Jf0T546pJIAStgUhVNMIrALxo',
      authDomain: 'planline-294e9.firebaseapp.com',
      projectId: 'planline-294e9',
      appId: '1:626402980763:web:4f8c9e01f28dac4efd273e',
    },
    googleSignIn: true,       // also show "Continue with Google"
  },

  // Footer links in the scheduler. It lives in app/, so these point one folder up. Add any page, e.g. a privacy policy page (AdSense requires one) or a "Buy me a coffee" page.
  links: [
    { label: 'Home', href: '../' },
    { label: 'Guides', href: '../guides/' },
    { label: 'Man-hour norms', href: '../man-hour-norms/' },
    { label: 'About', href: '../about/' },
    { label: 'Privacy', href: '../privacy.html' },
  ],
};
