import { useEffect, useRef, type ReactNode } from "react";
import { useDesktopLayout } from "../../hooks/useDesktopLayout";

export default function SidePanel({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const desktop = useDesktopLayout();
  useEffect(() => {
    if (ref.current) ref.current.open = desktop;
  }, [desktop]);
  return <details ref={ref} className="activity-side-panel"><summary>{title}</summary><div>{children}</div></details>;
}
