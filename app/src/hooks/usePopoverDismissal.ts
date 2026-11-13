import { useEffect, type RefObject } from "react";

export function usePopoverDismissal(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const dismiss = (event: Event) => {
      if (event.type === "scroll" && event.target instanceof Node && panel?.contains(event.target)) return;
      panel?.hidePopover();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      panel?.hidePopover();
      triggerRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, panelRef, triggerRef]);
}
