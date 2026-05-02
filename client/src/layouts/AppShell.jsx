import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLES, ROLE_TONE, isRoleMfaRequired } from "../auth/session";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/icons";
import {
  getMobileNavigationForRole,
  getNavigationForRole,
  getHomeRouteForRole
} from "../features/navigation/navigation";
import { NOTIFICATIONS } from "../data/notifications";
import { countUnread } from "../features/notifications/notificationModel";

function NavItem({ item, mobile = false }) {
  const baseClasses = mobile ? "flex flex-1 flex-col items-center gap-1 py-2 text-xs" : "nav-link";
  const activeClasses = mobile ? "text-vantage-navy" : "nav-link-active";
  const inactiveClasses = mobile ? "text-slate-500" : "";

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`
      }
      end={item.to === "/dashboard"}
    >
      <Icon name={item.icon} className={mobile ? "h-5 w-5" : "h-4 w-4"} />
      <span className={mobile ? "" : ""}>{item.label}</span>
    </NavLink>
  );
}

function FacilitySelector({ session, onSwitchFacility }) {
  if (!session.facilities || session.facilities.length <= 1) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Facility</p>
        <p className="text-sm font-semibold text-slate-900">{session.facility.name}</p>
        <p className="text-xs text-slate-500">{session.facility.operator}</p>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="sr-only">Select facility</span>
      <select
        className="field-control text-sm"
        value={session.facility.id}
        onChange={(event) => onSwitchFacility(event.target.value)}
      >
        {session.facilities.map((facility) => (
          <option key={facility.id} value={facility.id}>
            {facility.name} — {facility.operator}
          </option>
        ))}
      </select>
    </label>
  );
}

function RoleSwitcher({ session, onSwitchRole }) {
  const single = session.roles.length <= 1;

  if (single) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${ROLE_TONE[session.actingRole] || "bg-slate-100 text-slate-800"}`}
      >
        {session.actingRole}
      </span>
    );
  }

  return (
    <label className="grid gap-1 text-xs">
      <span className="sr-only">Acting role</span>
      <select
        value={session.actingRole}
        onChange={(event) => onSwitchRole(event.target.value)}
        className={`focus-ring rounded-full border-2 px-3 py-1 text-xs font-semibold ${ROLE_TONE[session.actingRole] || "bg-slate-100 text-slate-800 border-slate-200"}`}
      >
        {session.roles.map((role) => (
          <option key={role} value={role}>
            {role}
            {isRoleMfaRequired(role) ? " · MFA" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function NotificationButton({ unreadCount }) {
  return (
    <Link
      to="/notifications"
      className="focus-ring relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      aria-label={`Notifications (${unreadCount} unread)`}
    >
      <Icon name="bell" className="h-5 w-5" />
      {unreadCount > 0 ? (
        <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-vantage-red px-1 text-[10px] font-bold text-white">
          {unreadCount}
        </span>
      ) : null}
    </Link>
  );
}

function ProfileMenu({ session, onLogout, isOpen, onToggle }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="focus-ring flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm hover:bg-slate-50"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <Avatar initials={session.user.initials} name={session.user.name} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-semibold text-slate-900">{session.user.name}</span>
          <span className="block text-[11px] text-slate-500">{session.user.title}</span>
        </span>
      </button>
      {isOpen ? (
        <div
          className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-elevated"
          role="menu"
        >
          <p className="text-xs font-semibold text-slate-500">{session.user.email}</p>
          <p className="mt-1 text-xs text-slate-500">
            MFA: {session.user.mfaEnabled ? "enabled" : "not enabled"}
            {session.mfaSatisfied ? "" : " (challenge pending)"}
          </p>
          <hr className="my-3 border-slate-200" />
          <button
            type="button"
            onClick={onLogout}
            className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-slate-700 hover:bg-slate-100"
            role="menuitem"
          >
            <Icon name="logout" className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const { session, switchRole, switchFacility, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const navigation = getNavigationForRole(session.actingRole);
  const mobileNav = getMobileNavigationForRole(session.actingRole);
  const unreadCount = countUnread(NOTIFICATIONS, session.actingRole);
  const isMitigationOwner = session.actingRole === ROLES.MITIGATION_OWNER;

  function handleSwitchRole(role) {
    if (switchRole(role)) {
      navigate(getHomeRouteForRole(role));
    }
  }

  function handleSwitchFacility(facilityId) {
    switchFacility(facilityId);
  }

  function handleLogout() {
    setProfileOpen(false);
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <div className="lg:flex">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="px-5 pt-6">
            <Link to={getHomeRouteForRole(session.actingRole)} className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-vantage-navy text-white font-bold">
                V
              </span>
              <span className="text-lg font-bold text-vantage-navy">Vantage</span>
            </Link>
            <p className="mt-1 text-xs text-slate-500">Security Risk Assessment platform</p>
          </div>

          {!isMitigationOwner ? (
            <div className="px-5 pt-6">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Facility context
              </p>
              <div className="mt-2">
                <FacilitySelector session={session} onSwitchFacility={handleSwitchFacility} />
              </div>
            </div>
          ) : null}

          <nav aria-label="Primary" className="mt-6 flex-1 space-y-1 px-3">
            {navigation.map((item) => (
              <NavItem key={item.to} item={item} />
            ))}
          </nav>

          <div className="border-t border-slate-200 px-5 py-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Acting role</p>
            <div className="mt-2">
              <RoleSwitcher session={session} onSwitchRole={handleSwitchRole} />
            </div>
            {!session.mfaSatisfied ? (
              <p className="mt-2 text-[11px] font-medium text-amber-700">
                MFA challenge required for this role.
              </p>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3 lg:hidden">
                <Link to={getHomeRouteForRole(session.actingRole)} className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-vantage-navy text-white font-bold">
                    V
                  </span>
                  <span className="text-base font-bold text-vantage-navy">Vantage</span>
                </Link>
              </div>

              <div className="hidden flex-1 items-center gap-3 lg:flex">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {location.pathname.startsWith("/admin") ? "Admin" : isMitigationOwner ? "Mitigations" : "Workspace"}
                </p>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <div className="lg:hidden">
                  <RoleSwitcher session={session} onSwitchRole={handleSwitchRole} />
                </div>
                <NotificationButton unreadCount={unreadCount} />
                <ProfileMenu
                  session={session}
                  onLogout={handleLogout}
                  isOpen={profileOpen}
                  onToggle={() => setProfileOpen((open) => !open)}
                />
              </div>
            </div>
          </header>

          <main id="main" className="flex-1 px-4 py-5 pb-28 sm:px-6 lg:px-10 lg:py-8">
            <div className="mx-auto w-full max-w-7xl">
              <Outlet />
            </div>
          </main>

          <nav
            aria-label="Mobile navigation"
            className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
          >
            <div className="grid grid-cols-4">
              {mobileNav.slice(0, 4).map((item) => (
                <NavItem key={item.to} item={item} mobile />
              ))}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
