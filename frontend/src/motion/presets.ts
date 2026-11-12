/** Decorative motion only: never used to schedule a business operation. */
export const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

export const motionPresets = {
  page: { frames: [{ opacity: 0 }, { opacity: 1 }], duration: 200 },
  reveal: { frames: [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], duration: 260 },
  popoverIn: { frames: [{ opacity: 0, translate: '0 -4px', scale: '.985' }, { opacity: 1, translate: '0 0', scale: '1' }], duration: 180 },
  popoverOut: { frames: [{ opacity: 1 }, { opacity: 0 }], duration: 160 },
} satisfies Record<string, { frames: Keyframe[]; duration: number }>;

export function animateElement(element: HTMLElement, preset: keyof typeof motionPresets, delay = 0) {
  if (motionPreference.matches || typeof element.animate !== 'function') return null;
  const { frames, duration } = motionPresets[preset];
  const animation = element.animate(frames, { duration, delay, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' });
  const cancel = () => { if (motionPreference.matches) animation.cancel(); };
  motionPreference.addEventListener('change', cancel);
  // Cancel removes the temporary compositing context and leaves no inline styles.
  void animation.finished.then(() => { if (preset !== 'popoverOut') animation.cancel(); }, () => {}).finally(() => motionPreference.removeEventListener('change', cancel));
  return animation;
}
