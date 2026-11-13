import { useId, useRef, useState, type KeyboardEvent } from "react";
import { usePopoverDismissal } from "../../hooks/usePopoverDismissal";

type SelectOption = { value: string; label: string };

export default function SelectField({ label, value, options, onChange, className = "" }: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 180 });
  const selected = options.findIndex((option) => option.value === value);
  usePopoverDismissal(open, panel, trigger);
  const activate = (index: number) => {
    activeRef.current = index;
    setActive(index);
  };
  const reveal = (index = Math.max(0, selected)) => {
    activate(index);
    if (!panel.current?.matches(":popover-open")) panel.current?.showPopover();
    requestAnimationFrame(() => document.getElementById(`${id}-option-${index}`)?.scrollIntoView({ block: "nearest" }));
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    panel.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
    onChange(option.value);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const isOpen = panel.current?.matches(":popover-open");
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      panel.current?.hidePopover();
      trigger.current?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Tab") {
      panel.current?.hidePopover();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      reveal(isOpen ? (activeRef.current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length : Math.max(0, selected));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      reveal(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) choose(activeRef.current); else reveal();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = event.timeStamp;
      const text = (now - typeahead.current.time < 700 ? typeahead.current.text : "") + event.key.toLowerCase();
      typeahead.current = { text, time: now };
      const index = options.findIndex((option) => option.label.toLowerCase().startsWith(text));
      if (index >= 0) { event.preventDefault(); reveal(index); }
    }
  };
  return <div className={`select-field ${className}`} onKeyDown={onKeyDown}>
    <span id={`${id}-label`} className="control-label">{label}</span>
    <button ref={trigger} type="button" className="select-trigger" role="combobox"
      disabled={!options.length}
      aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={`${id}-list`} aria-invalid={selected < 0 || undefined}
      aria-activedescendant={open ? `${id}-option-${active}` : undefined}
      onClick={() => panel.current?.matches(":popover-open") ? panel.current.hidePopover() : reveal()}>
      <span>{options[selected]?.label ?? "Unavailable selection"}</span><span aria-hidden="true" className="select-chevron" />
    </button>
    <div ref={panel} id={`${id}-list`} className="select-menu" role="listbox"
      aria-labelledby={`${id}-label`} popover="auto" style={position}
      onToggle={(event) => {
        const isOpen = event.currentTarget.matches(":popover-open");
        setOpen(isOpen);
        if (!isOpen || !trigger.current) return;
        const rect = trigger.current.getBoundingClientRect();
        const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
        event.currentTarget.style.width = `${width}px`;
        const height = event.currentTarget.offsetHeight;
        setPosition({
          left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width,
          top: Math.max(8, rect.bottom + height + 6 <= window.innerHeight
            ? rect.bottom + 6 : rect.top - height - 6),
        });
      }}>
      {options.map((option, index) => <button type="button" role="option" tabIndex={-1}
        id={`${id}-option-${index}`} key={option.value} aria-selected={index === selected}
        className={index === active ? "select-option-active" : undefined}
        onPointerMove={() => activate(index)} onClick={() => choose(index)}>
        <span>{option.label}</span>{index === selected && <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16">
          <path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>}
      </button>)}
    </div>
  </div>;
}
