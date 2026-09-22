import { useLayoutEffect, useRef } from 'preact/hooks';

/**
 * Shared dismissal for composer popups, including non-focusable outside surfaces.
 * `reason` lets a popup with an inner level (a submenu) step back on Escape instead of closing.
 */
export function useDismissiblePopup<T extends HTMLElement>(open: boolean, dismiss: (reason: 'outside' | 'escape' | 'blur') => void) {
  const root = useRef<T>(null);
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useLayoutEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) dismissRef.current('outside');
    };
    const escape = (event: KeyboardEvent) => {
      const container = root.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const trigger = container?.querySelector<HTMLElement>('[aria-haspopup][aria-expanded="true"]');
        dismissRef.current('escape');
        // Nested pickers can go back one level instead of closing. Only return
        // focus if the focused menu item was removed by that transition.
        requestAnimationFrame(() => {
          if (trigger?.isConnected && (!document.activeElement || document.activeElement === document.body)) trigger.focus();
        });
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !container?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement).matches('input, textarea, select, [contenteditable="true"]')) return;
      const menu = container.querySelector<HTMLElement>('[role="menu"]');
      if (!menu) return;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'))
        .filter(item => !item.matches(':disabled, [aria-disabled="true"]') && item.getClientRects().length > 0);
      if (!items.length) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowDown' ? (current + 1) % items.length : (current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length);
      event.preventDefault();
      event.stopPropagation();
      items[index]?.focus();
    };
    const blur = () => dismissRef.current('blur');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', blur);
    };
  }, [open]);
  return root;
}
