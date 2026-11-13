import { Children, type ReactNode } from "react";
import { useDesktopLayout } from "../../hooks/useDesktopLayout";

export default function ActivityLayout({ children }: { children: ReactNode }) {
  const desktop = useDesktopLayout();
  const content = Children.toArray(children);
  return <div className="activity-layout">{desktop ? content : content.reverse()}</div>;
}
