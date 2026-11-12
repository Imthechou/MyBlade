import { mountTournament } from '../../v19/arena/view.js';
import { commitTournament, hasLegacyCareer, openFurnace, tournamentView } from '../../core/v19Progress.js';
import { get } from '../../core/progress.js';
import router from '../router.js';
import { toast } from '../dom.js';
import { open as openSettings } from '../settingsSheet.js';

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
    onSettings: openSettings,
    onLegacy: () => router.go('legacy-arena'),
    onForge: () => {
      const result = openFurnace({ restart: true });
      if (!result.ok) return toast(result.error, 'warn');
      router.go('forge');
    },
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

export function back() {
  return page?.back();
}
