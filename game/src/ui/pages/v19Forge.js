import { mountForge } from '../../v19/forgeView.js';

let page;

export function render() {
  if (!page) page = mountForge(document.getElementById('v19-forge'), {
    onArena: bladeId => import('./v19Arena.js').then(arena => arena.openTournament({ bladeId })),
    onCollection: () => import('./workshop.js').then(workshop => workshop.openTab('collection')),
  });
  page.enter();
}

export function leave() {
  page?.leave();
}

export function pauseForSettings() {
  page?.pause();
}
