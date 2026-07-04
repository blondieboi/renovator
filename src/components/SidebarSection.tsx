import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function SidebarSection({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="sidebar-section">
      <button className="sidebar-section-header" onClick={onToggle} type="button">
        <span>{title}</span>
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </button>
      {!collapsed && <div className="sidebar-section-body">{children}</div>}
    </section>
  );
}

export default SidebarSection;
