import { NavLink, Outlet, useLocation } from "react-router-dom";
import { CalendarDays, Ellipsis, Sun, BarChart3 } from "lucide-react";
import { ResumeWatcher } from "../features/workout/ResumeWatcher";
import { paths, ROUTES } from "./paths";
import "./AppShell.css";

const tabs = [
  { to: "/", label: "Aujourd'hui", icon: Sun },
  { to: paths.planning(), label: "Programme", icon: CalendarDays },
  { to: paths.progression(), label: "Progression", icon: BarChart3 },
  { to: paths.plus(), label: "Plus", icon: Ellipsis },
];

export function AppShell() {
  const location = useLocation();

  /* Flux modaux (§18) : bibliothèque en mode sélection, sélection de briques. */
  const params = new URLSearchParams(location.search);
  const selectionMode =
    (location.pathname.startsWith("/exercises") && params.get("mode") === "select") ||
    (location.pathname.startsWith(`${ROUTES.sessions}/`) && params.get("select") === "1");

  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>

      <ResumeWatcher />

      {!selectionMode && (
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
      )}
    </div>
  );
}
