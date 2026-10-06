// Tells the app when a newer version has been installed behind the page the member is looking at, so it can offer a refresh instead of leaving
// them on old code. The service worker already activates the new version straight away (src/sw.js); the open page just never knew.
// Also asks the browser to look for a new version every half hour and whenever the tab comes back into view (an open tab otherwise never checks).
export const CHECK_EVERY_MS = 30 * 60 * 1000;

export function watchForNewVersion(onReady, { serviceWorker = globalThis.navigator?.serviceWorker, doc = globalThis.document, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  if (!serviceWorker) return () => {};
  // The very first install also changes the controller; that is not an update, so only count a change once the page already had one.
  let hadController = !!serviceWorker.controller;
  const onChange = () => { if (hadController) onReady(); hadController = true; };
  const check = () => { Promise.resolve(serviceWorker.getRegistration?.()).then(registration => registration?.update?.()).catch(() => {}); };
  const onVisible = () => { if (doc?.visibilityState === 'visible') check(); };
  serviceWorker.addEventListener('controllerchange', onChange);
  doc?.addEventListener?.('visibilitychange', onVisible);
  const timer = setIntervalFn(check, CHECK_EVERY_MS);
  return () => { serviceWorker.removeEventListener('controllerchange', onChange); doc?.removeEventListener?.('visibilitychange', onVisible); clearIntervalFn(timer); };
}
