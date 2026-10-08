// Android's system Back button. Capacitor tells the page when it is pressed; without a handler Back would leave a photo or pop-up open and go
// back a page (or quit the app). Order: close the top-most open dialog, else step back through the page history, else quit.
export function handleNativeBack({ canGoBack } = {}, { doc = document, history = window.history, exitApp } = {}) {
  const open = [...doc.querySelectorAll('dialog[open]')].pop();
  if (open) {
    // The app's dialogs close from their "cancel" handler (what Esc does on a computer); close it directly if one has no handler.
    const cancel = new Event('cancel', { cancelable: true });
    open.dispatchEvent(cancel);
    if (!cancel.defaultPrevented && typeof open.close === 'function') open.close();
    return 'closed-dialog';
  }
  if (canGoBack) { history.back(); return 'back'; }
  exitApp?.();
  return 'exit';
}
