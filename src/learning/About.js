/**
 * The About tab Teach and Learn share (the Rhizome pattern): a quick
 * reference beside the work, and the Help library's tutorials, from one
 * source (help.js), opened in place.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { setCrumbs } from '../ui/crumbs.js';
import { Markdown } from '../ui/markdown.js';
import { loadHelp } from '../platform/help.js';
import { LEARNING_HELP, LEARNING_HELP_ID } from './help.js';

let helpDoc = null;
let asked = false;
const helpHref = (pageId) => `help.html#${LEARNING_HELP_ID}/${pageId}`;

/** About({ arg, intro, refs, data, rerender }): refs = [[title, [[term, words]…]]…]. */
export function About({ arg, title, intro, refs = [], data = null, rerender = null, back = '#about' }) {
  if (!asked) {
    asked = true;
    loadHelp().then(({ doc }) => { helpDoc = doc.sections.find((s) => s.id === LEARNING_HELP_ID) ?? LEARNING_HELP; rerender?.(); }).catch(() => { helpDoc = LEARNING_HELP; });
  }
  const section = helpDoc ?? LEARNING_HELP;
  const page = section.pages.find((p) => p.id === arg) ?? null;
  setCrumbs(page ? [{ label: page.title }] : []);
  const ref = (t, rows) => h('section', { class: 'lx-panel' }, h('h3', {}, t), h('dl', { class: 'lx-ref' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
  if (page) {
    return h('div', { class: 'lx-page' },
      h('article', { class: 'lx-panel lx-help' },
        h('header', { class: 'lx-ahead' }, h('h3', {}, page.title), h('a', { class: 'btn btn-xs btn-outline', href: helpHref(page.id) }, 'Open in Help')),
        Markdown(page.body),
        h('a', { class: 'lx-back', href: back }, '← Quick reference')));
  }
  return h('div', { class: 'lx-page' },
    h('div', { class: 'lx-intro' }, h('h2', {}, title), h('p', {}, intro)),
    h('div', { class: 'lx-two' },
      h('div', { class: 'lx-stack' }, refs.map(([t, rows]) => ref(t, rows))),
      h('div', { class: 'lx-stack' },
        h('section', { class: 'lx-panel' }, h('h3', {}, 'Tutorials'), h('p', { class: 'lx-note' }, 'The same pages are in Help, under Teach and Learn.'),
          h('ul', { class: 'lx-tutorials' }, section.pages.map((p) => h('li', {}, h('a', { href: `${back}/${p.id}` }, icon('book', 15), p.title), h('a', { class: 'lx-out', href: helpHref(p.id), title: 'Open in Help' }, 'Help'))))),
        data && h('section', { class: 'lx-panel' }, h('h3', {}, 'Your data'), h('p', { class: 'lx-note' }, data)),
        h('section', { class: 'lx-panel' }, h('h3', {}, 'What this stands on'), h('ul', { class: 'lx-sourcelist' },
          ['Universal Design for Learning (CAST, guidelines 3.0)', 'WCAG 2.2 AA', 'Critical EdTech: no surveillance, no hidden scores', 'Freire, hooks and Brookfield on adult learning as dialogue', 'Illich’s learning webs, for the Lyceum to come', 'The community of inquiry: teaching, social and reflective presence'].map((s) => h('li', {}, s)))))));
}
