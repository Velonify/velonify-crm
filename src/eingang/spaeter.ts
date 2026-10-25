/** Put off until tomorrow: key → day it shows up again. Per browser, like a personal snooze. */
const SPAETER_KEY = 'velonify-hub.eingang-spaeter';

export function leseSpaeter(heute: string): Record<string, string> {
  try {
    const alle = JSON.parse(localStorage.getItem(SPAETER_KEY) ?? '{}') as Record<string, string>;
    return Object.fromEntries(Object.entries(alle).filter(([, bis]) => bis > heute));
  } catch {
    return {};
  }
}

export function schreibeSpaeter(werte: Record<string, string>) {
  try {
    localStorage.setItem(SPAETER_KEY, JSON.stringify(werte));
  } catch {
    // Storage blocked: putting off lasts until reload.
  }
}
