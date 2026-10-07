/* Guide pages: show AdSense units once js/config.js turns ads on. */
(function () {
  var a = (window.PS_CONFIG || {}).ads || {};
  if (!a.enabled || !a.adsenseClient) return;
  var s = document.createElement('script');
  s.async = true; s.crossOrigin = 'anonymous';
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(a.adsenseClient);
  document.head.appendChild(s);
  var slot = (a.slots || {}).content || (a.slots || {}).bottom;
  if (!slot) return;
  document.querySelectorAll('.ad-slot').forEach(function (box) {
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle'; ins.style.display = 'block';
    ins.setAttribute('data-ad-client', a.adsenseClient);
    ins.setAttribute('data-ad-slot', slot);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    box.appendChild(ins); box.hidden = false;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
})();
