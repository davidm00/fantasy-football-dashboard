import { useEffect, type RefObject } from "react";

export function usePopoverDismissal(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  onFallbackDismiss?: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const hide = () => {
      if (panel && "hidePopover" in panel) panel.hidePopover();
      else onFallbackDismiss?.();
    };
    const dismiss = (event: Event) => {
      if (event.type === "scroll" && event.target instanceof Node && panel?.contains(event.target)) return;
      hide();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node &&
          !panel?.contains(event.target) && !triggerRef.current?.contains(event.target)) hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      hide();
      triggerRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", onKeyDown);
    if (panel && !("hidePopover" in panel)) window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, panelRef, triggerRef, onFallbackDismiss]);
}
