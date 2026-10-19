/** True when the hub runs as installed desktop app (Chrome "Install", Safari "Add to Dock"), not in a browser tab. */
export function alsAppInstalliert(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

/** Number on the Dock icon of the installed app; 0 removes it. Browser tabs ignore it. */
export function setzeAppBadge(anzahl: number): void {
  if (!('setAppBadge' in navigator)) return;
  const auftrag = anzahl > 0 ? navigator.setAppBadge(anzahl) : navigator.clearAppBadge();
  auftrag.catch(() => {
    // Not installed or badges switched off in macOS: nothing to show.
  });
}
