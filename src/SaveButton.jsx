import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

// One save button for the whole site, so every save looks and behaves the same: the label, then "Saving…", then an emerald-green check and "Saved".
// The green is deliberate. Blue is the colour of a button you can press; green with a check is the colour of "done".
export function SaveButton({ saving = false, saved = false, children = 'Save', savingLabel = 'Saving…', savedLabel = 'Saved', className = 'primary', disabled = false, ...rest }) {
  const done = saved && !saving;
  return <button {...rest} className={`${className} save-button${done ? ' is-saved' : ''}`} disabled={disabled || saving} aria-live="polite">
    {saving ? savingLabel : done ? <><Check size={16} aria-hidden="true"/>{savedLabel}</> : children}
  </button>;
}

// For a save that shows "Saved" for a moment and then goes back to the normal label: [saved, flash]. Call flash() once the save has worked.
export function useSavedFlash(ms = 2500) {
  const [saved, setSaved] = useState(false), timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = () => { setSaved(true); clearTimeout(timer.current); timer.current = setTimeout(() => setSaved(false), ms); };
  return [saved, flash];
}

// When a save is followed by closing the window, hold the green "Saved" on screen briefly so the person sees it before the window goes.
export const SAVED_HOLD_MS = 900;
export const showSavedThen = (setSaved, next) => { setSaved(true); return new Promise(resolve => setTimeout(() => { next(); resolve(); }, SAVED_HOLD_MS)); };
