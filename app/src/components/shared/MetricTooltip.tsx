import { useCallback, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { usePopoverDismissal } from "../../hooks/usePopoverDismissal";
import { usePopoverSupport } from "../../hooks/usePopoverSupport";

function MetricTooltip({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  const id = useId();
  const supportsPopover = usePopoverSupport();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  const positionStyle: CSSProperties & {
    "--metric-tooltip-left": string;
    "--metric-tooltip-top": string;
  } = {
    "--metric-tooltip-left": `${position.left}px`,
    "--metric-tooltip-top": `${position.top}px`,
  };

  const closeFallback = useCallback(() => setOpen(false), []);
  usePopoverDismissal(open, popover, trigger, closeFallback);
  const updatePosition = (panel: HTMLSpanElement) => {
    if (!trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    setPosition({
      left: Math.max(16, Math.min(
        rect.left + rect.width / 2 - panel.offsetWidth / 2,
        window.innerWidth - panel.offsetWidth - 16,
      )),
      top: Math.max(16, rect.bottom + panel.offsetHeight + 8 <= window.innerHeight
        ? rect.bottom + 8
        : rect.top - panel.offsetHeight - 8),
    });
  };

  return (
    <span className="metric-tooltip" onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      if (supportsPopover) popover.current?.hidePopover();
      else setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    }}>
      <button
        ref={trigger}
        className="metric-tooltip-trigger"
        type="button"
        aria-label={`Explain ${label}`}
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={supportsPopover ? id : undefined}
        onClick={!supportsPopover ? () => {
          setOpen(!open);
          if (!open) requestAnimationFrame(() => popover.current && updatePosition(popover.current));
        } : undefined}
      >
        ?
      </button>
      <span
        ref={popover}
        id={id}
        className={`metric-tooltip-panel${!supportsPopover ? " metric-tooltip-fallback" : ""}`}
        popover={supportsPopover ? "auto" : undefined}
        hidden={!supportsPopover && !open}
        role="dialog"
        aria-label={`${label} explanation`}
        style={positionStyle}
        onToggle={(event) => {
          if (!supportsPopover) return;
          const panel = event.currentTarget;
          const isOpen = panel.matches(":popover-open");
          setOpen(isOpen);
          if (!isOpen || !trigger.current) return;
          updatePosition(panel);
        }}
      >
        <span className="metric-tooltip-heading">
          <strong>{label}</strong>
          <button
            type="button"
            aria-label={`Close ${label} explanation`}
            popoverTarget={supportsPopover ? id : undefined}
            popoverTargetAction="hide"
            onClick={() => {
              if (!supportsPopover) setOpen(false);
              trigger.current?.focus({ preventScroll: true });
            }}
          >
            Close
          </button>
        </span>
        <span>{children}</span>
      </span>
    </span>
  );
}

export default MetricTooltip;
