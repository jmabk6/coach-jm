import { NavLink, Outlet } from "react-router-dom";
import { CalendarDays, Ellipsis, Sun, BarChart3 } from "lucide-react";
import "./AppShell.css";

const tabs = [
  { to: "/", label: "Aujourd'hui", icon: Sun },
  { to: "/programme", label: "Programme", icon: CalendarDays },
  { to: "/progression", label: "Progression", icon: BarChart3 },
  { to: "/plus", label: "Plus", icon: Ellipsis },
];

export function AppShell() {
  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>

      <nav className="tab-bar" aria-label="Navigation principale">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `tab-bar__item ${isActive ? "tab-bar__item--active" : ""}`
            }
          >
            <Icon size={22} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
