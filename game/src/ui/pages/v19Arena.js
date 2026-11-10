import { mountTournament } from '../../v19/arena/view.js';
import { commitTournament, hasLegacyCareer, tournamentView } from '../../core/v19Progress.js';
import { get } from '../../core/progress.js';
import router from '../router.js';

let page;
let pending;

export function openTournament(selection) {
  pending = selection;
  router.go('arena');
}

export function render() {
  page ??= mountTournament(document.getElementById('v19-arena'), {
    getSave: tournamentView,
    commit: commitTournament,
    settings: () => get().settings,
    hasLegacyCareer,
    onLegacy: () => router.go('legacy-arena'),
  });
  page.open(pending);
  pending = undefined;
}

export function leave() {
  page?.leave();
}

export function pauseForSettings() {
  page?.pause();
}
