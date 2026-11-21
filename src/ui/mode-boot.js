/*
 * Light or dark for Dashi's own screens, set before the page draws so it
 * never flashes. Dark mode is paused for now (d, alpha 0.2): every screen
 * is light, and the header has no switch. To bring it back, set DARK_MODE
 * to true here and in mode.js; each person's choice is still kept in this
 * browser (localStorage dashi.mode = light | dark), and with none, Dashi
 * follows the device. Public sites keep their own look. A plain script.
 */
(function () {
  var DARK_MODE = false;
  var mode = 'light';
  if (DARK_MODE) {
    try { mode = localStorage.getItem('dashi.mode'); } catch (e) { /* private window */ }
    if (mode !== 'light' && mode !== 'dark') mode = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-mode', mode);
})();
