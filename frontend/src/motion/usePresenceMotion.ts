import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { animateElement, motionPreference } from './presets';

const subscribe = (listener: () => void) => {
  motionPreference.addEventListener('change', listener);
  return () => motionPreference.removeEventListener('change', listener);
};

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => motionPreference.matches, () => true);
}

/** Presence for small, inert popovers only. Routes and resource-owning dialogs unmount immediately. */
export function usePresenceMotion<T extends HTMLElement>(present: boolean) {
  const ref = useRef<T>(null);
  const [rendered, setRendered] = useState(present);
  const reduced = useReducedMotion();

  useLayoutEffect(() => { if (present) setRendered(true); }, [present]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!rendered || !element) return;
    element.inert = !present;
    element.dataset.motionState = present ? 'enter' : 'exit';
    const animation = reduced ? null : animateElement(element, present ? 'popoverIn' : 'popoverOut');
    let active = true;
    if (!present) {
      if (!animation) setRendered(false);
      else {
        const finish = () => { if (active) setRendered(false); };
        void animation.finished.then(finish, finish);
      }
    }
    return () => { active = false; animation?.cancel(); };
  }, [present, rendered, reduced]);

  return { ref, rendered };
}
