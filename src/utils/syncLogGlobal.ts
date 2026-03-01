/** Call from anywhere (e.g. link in settings) to open the sync log dialog */
export function openSyncLogGlobal() {
  window.dispatchEvent(new CustomEvent('roomi-open-sync-log'));
}
