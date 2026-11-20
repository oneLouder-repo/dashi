// The page's two head guards from the kit's starter, as a file so the server's CSP (script-src 'self') allows them:
// the hero's entrance waits for motion.js (the 700ms mark shows the words if it is late), and moments get their guard.
document.documentElement.classList.add('m-enter', 'mo-js');
setTimeout(() => document.documentElement.classList.add('m-enter-done'), 700);
setTimeout(() => document.documentElement.classList.add('mo-safe'), 2500);
