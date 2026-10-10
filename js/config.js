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

  // Footer links in the scheduler. It lives in app/, so these point one folder up. Add any page, e.g. a privacy policy page (AdSense requires one) or a "Buy me a coffee" page.
  links: [
    { label: 'Home', href: '../' },
    { label: 'Guides', href: '../guides/' },
    { label: 'Man-hour norms', href: '../man-hour-norms/' },
    { label: 'About', href: '../about/' },
    { label: 'Privacy', href: '../privacy.html' },
  ],
};
