import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

export function AppShell() {
  const { pathname } = useLocation();
  const isLive = pathname === "/lesson";

  if (isLive) {
    return (
      <div className="app-shell live-mode">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="left-nav">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ✦
          </span>
          <div>
            <strong>Mentora</strong>
            <span>Your AI Teacher</span>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/lessons">Lessons</NavLink>
          <NavLink to="/stats">Stats</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <Link to="/settings" className="avatar-card">
          <div className="avatar-orb" />
          <div>
            <strong>Mentora AI</strong>
            <p>Open preferences</p>
          </div>
        </Link>
      </aside>
      <div className="app-main">
        <Outlet />
      </div>
    </div>
  );
}
