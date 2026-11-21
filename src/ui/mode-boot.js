/*
 * Light or dark for Dashi's own screens, set before the page draws so it
 * never flashes. Each person's choice is kept in this browser
 * (localStorage dashi.mode = light | dark); with none, Dashi follows the
 * device. Public sites keep their own look. A plain script, not a module.
 */
(function () {
  var mode = null;
  try { mode = localStorage.getItem('dashi.mode'); } catch (e) { /* private window */ }
  if (mode !== 'light' && mode !== 'dark') mode = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-mode', mode);
})();
