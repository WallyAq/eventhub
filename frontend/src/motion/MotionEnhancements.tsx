import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { animateElement } from './presets';
import { useReducedMotion } from './usePresenceMotion';

// No translated ancestor may contain a fixed overlay. These are leaf cards/illustrations.
const revealSelector = [
  '.home-copy', '.home-showcase-slot', '.login-choice__options > article',
  '.events-grid > .event-card', '.participant-featured-card',
  '.participant-details__activity', '.participant-details__speaker',
  '.my-registration-card', '.manage-onboarding ol > li',
  '.dashboard-metric', '.dashboard-event', '.program-person', '.program-activity',
].join(',');
const surfaceSelector = '.home-hero, .login-choice, .auth-frame, .recovery-card, .business-main, .profile-main, .organizations-main, .error-screen__content, .shell > main';

/** No wrapper, scroll hijacking, route remount, or retention of the previous screen. */
export function MotionEnhancements() {
  const { pathname, search } = useLocation();
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    if (reduced) return;
    const root = document.getElementById('root');
    if (!root) return;
    const seen = new WeakSet<Element>();
    const surfaces = new WeakSet<Element>();
    const pending = new Set<Element>();
    const animations = new Set<Animation>();
    let frame = 0;

    function play(element: HTMLElement, preset: 'page' | 'reveal', delay = 0) {
      const animation = animateElement(element, preset, delay);
      if (!animation) return;
      animations.add(animation);
      void animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    }
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      let index = 0;
      entries.forEach(entry => {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) return;
        observer?.unobserve(entry.target);
        if (entry.target.isConnected) play(entry.target, 'reveal', Math.min(index++, 3) * 30);
      });
    }, { threshold: .08 }) : null;

    function collect(node: Element) {
      const surfaceNodes = [...node.querySelectorAll<HTMLElement>(surfaceSelector)];
      if (node.matches(surfaceSelector) && node instanceof HTMLElement) surfaceNodes.unshift(node);
      surfaceNodes.forEach(element => {
        if (surfaces.has(element)) return;
        surfaces.add(element);
        play(element, 'page'); // Opacity alone preserves fixed positioning and existing transforms.
      });
      const cards = [...node.querySelectorAll<HTMLElement>(revealSelector)];
      if (node.matches(revealSelector) && node instanceof HTMLElement) cards.unshift(node);
      cards.forEach(element => {
        if (seen.has(element) || element.closest('dialog, .loading-skeleton')) return;
        seen.add(element);
        // Fail open: nothing is hidden while awaiting intersection or when JS is unavailable.
        if (observer) observer.observe(element);
      });
    }
    collect(root);
    const mutations = new MutationObserver(records => {
      records.forEach(record => {
        record.removedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          observer?.unobserve(node);
          node.querySelectorAll(revealSelector).forEach(element => observer?.unobserve(element));
        });
        record.addedNodes.forEach(node => { if (node instanceof Element) pending.add(node); });
      });
      if (frame || !pending.size) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        pending.forEach(node => { if (node.isConnected) collect(node); });
        pending.clear();
      });
    });
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      mutations.disconnect(); observer?.disconnect(); cancelAnimationFrame(frame);
      pending.clear(); animations.forEach(animation => animation.cancel());
    };
  }, [pathname, search, reduced]);
  return null;
}
