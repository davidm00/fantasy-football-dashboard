import { useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { usePopoverDismissal } from "../../hooks/usePopoverDismissal";

function MetricTooltip({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  const id = useId();
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

  usePopoverDismissal(open, popover, trigger);

  return (
    <span className="metric-tooltip">
      <button
        ref={trigger}
        className="metric-tooltip-trigger"
        type="button"
        aria-label={`Explain ${label}`}
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
      >
        ?
      </button>
      <span
        ref={popover}
        id={id}
        className="metric-tooltip-panel"
        popover="auto"
        role="dialog"
        aria-label={`${label} explanation`}
        style={positionStyle}
        onToggle={(event) => {
          const panel = event.currentTarget;
          const isOpen = panel.matches(":popover-open");
          setOpen(isOpen);
          if (!isOpen || !trigger.current) return;
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
        }}
      >
        <span className="metric-tooltip-heading">
          <strong>{label}</strong>
          <button
            type="button"
            aria-label={`Close ${label} explanation`}
            popoverTarget={id}
            popoverTargetAction="hide"
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
