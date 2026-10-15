import { Link, Outlet, useLocation } from "react-router-dom";
import { ResumeWatcher } from "../features/workout/ResumeWatcher";
import { ScreenWakeLockKeeper } from "../features/workout/ScreenWakeLockKeeper";
import { activeTabFor, isTabBarHidden, TABS } from "./tabs";
import "./AppShell.css";

export function AppShell() {
  const location = useLocation();

  /* Séance en cours en plein écran (D5) et flux modaux (§18) : pas de barre. */
  const hidden = isTabBarHidden(location.pathname, location.search);
  const active = activeTabFor(location.pathname);

  return (
    <div className={`app-shell${hidden ? " app-shell--no-tabbar" : ""}`}>
      <main className="app-content">
        <Outlet />
      </main>

      <ResumeWatcher />
      {/* Écran allumé tant qu'une séance est active (15/10/2026). */}
      <ScreenWakeLockKeeper />

      {!hidden && (
        <nav className="tab-bar" aria-label="Navigation principale">
          {TABS.map(({ key, to, label, icon: Icon }) => (
            <Link
              key={key}
              to={to}
              aria-current={active === key ? "page" : undefined}
              className={`tab-bar__item${active === key ? " tab-bar__item--active" : ""}`}
            >
              <Icon size={22} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
