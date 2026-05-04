import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  FileText,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wand2
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  ROLES,
  canDemoSwitchToRole,
  getDemoPersona,
  isRoleMfaRequired
} from "../auth/session";
import {
  getHomeRouteForRole,
  getNavigationForRole
} from "../features/navigation/navigation";
import { NOTIFICATIONS } from "../data/notifications";
import { countUnread, filterForRole } from "../features/notifications/notificationModel";
import { useWorkspace } from "../features/assessmentWorkspace/WorkspaceContext";

const SEVERITY_ICONS = {
  warn: { Icon: AlertTriangle, className: "text-amber-700", bg: "bg-amber-50" },
  danger: { Icon: AlertTriangle, className: "text-red-700", bg: "bg-red-50" },
  info: { Icon: MessageSquare, className: "text-[#1E3A5F]", bg: "bg-[#EFF4FB]" }
};

const TYPE_ICONS = {
  approved: { Icon: CheckCircle2, className: "text-emerald-700", bg: "bg-emerald-50" },
  "ai-flag": { Icon: Sparkles, className: "text-[#1E3A5F]", bg: "bg-[#EFF4FB]" },
  "config-change": { Icon: Settings, className: "text-[#1E3A5F]", bg: "bg-[#EFF4FB]" },
  "user-added": { Icon: Users, className: "text-zinc-700", bg: "bg-zinc-100" },
  "version-created": { Icon: FileText, className: "text-zinc-700", bg: "bg-zinc-100" },
  "mitigation-done": { Icon: Wand2, className: "text-emerald-700", bg: "bg-emerald-50" }
};

function notificationIcon(notification) {
  if (TYPE_ICONS[notification.type]) return TYPE_ICONS[notification.type];
  return SEVERITY_ICONS[notification.severity] || SEVERITY_ICONS.info;
}

function NavTab({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `app-topbar-nav-link shrink-0 whitespace-nowrap ${isActive ? "app-topbar-nav-link-active" : ""}`
      }
    >
      {children}
    </NavLink>
  );
}

function RoleSwitcher({ session, onSwitchRole }) {
  const allRoles = Object.values(ROLES);
  const switchableRoles = session.demo
    ? allRoles
    : allRoles.filter((role) => canDemoSwitchToRole(session, role));
  const single = switchableRoles.length <= 1;
  const [open, setOpen] = useState(false);

  if (single) {
    return (
      <span className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/85">
        {session.actingRole}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md border border-[#F59E0B]/40 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/85 transition hover:bg-white/10"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span style={{ color: "#F59E0B" }} className="font-semibold">
          {session.demo ? "Demo:" : "Role:"}
        </span>
        <span className="max-w-[120px] truncate">{session.actingRole}</span>
        <ChevronDown size={11} className="shrink-0 opacity-80" aria-hidden />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close role menu"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl"
            role="listbox"
          >
            <div className="border-b border-zinc-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {session.demo ? "Demo: switch role" : "Switch acting role"}
            </div>
            {switchableRoles.map((role) => {
              const persona = getDemoPersona(role);
              const isActive = session.actingRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                    isActive ? "bg-[#EFF4FB] text-[#1E3A5F]" : "text-zinc-800 hover:bg-zinc-50"
                  }`}
                  onClick={() => {
                    onSwitchRole(role);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1">
                    <span className="block font-medium">{role}</span>
                    {persona ? (
                      <span className="mt-0.5 block text-[11px] text-zinc-500">{persona.name}</span>
                    ) : null}
                  </span>
                  {isRoleMfaRequired(role) ? (
                    <span className="text-[10px] text-zinc-500">MFA</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function NotificationDropdown({ actingRole, unreadCount }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const items = useMemo(() => filterForRole([...NOTIFICATIONS], actingRole).slice(0, 6), [actingRole]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-md p-1.5 transition-colors ${
          open ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
        }`}
        aria-expanded={open}
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell size={15} strokeWidth={2} aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
        ) : null}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,360px)] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-zinc-900">Notifications</span>
                {unreadCount > 0 ? (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                    {unreadCount} unread
                  </span>
                ) : null}
              </div>
              <button type="button" className="text-[11px] text-zinc-500 hover:text-zinc-900">
                Mark all read
              </button>
            </div>
            <div className="max-h-[min(60vh,420px)] overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-zinc-500">
                  No notifications for this role.
                </p>
              ) : (
                items.map((n) => {
                  const { Icon: NotifIcon, className, bg } = notificationIcon(n);
                  return (
                    <Link
                      key={n.id}
                      to={n.href || "/notifications"}
                      onClick={() => setOpen(false)}
                      className={`block border-b border-zinc-100 px-4 py-2.5 text-left hover:bg-zinc-50/60 ${
                        !n.read ? "bg-[#EFF4FB]/30" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded ${bg}`}>
                          <NotifIcon size={12} className={className} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[12px] font-medium text-zinc-900">{n.title}</span>
                            {!n.read ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E3A5F]" />
                            ) : null}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-600">
                            {n.body}
                          </p>
                          <p className="mt-1 text-[10px] text-zinc-400">
                            {new Date(n.timestamp).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short"
                            })}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/40 px-4 py-2">
              <button type="button" className="text-[11px] text-zinc-500 hover:text-zinc-900">
                Notification settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate("/notifications");
                }}
                className="text-[11px] font-medium text-[#1E3A5F] hover:text-[#16294A]"
              >
                View all →
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const { session, switchRole, switchDemoRole, logout } = useAuth();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = getNavigationForRole(session.actingRole);
  const unreadCount = countUnread(NOTIFICATIONS, session.actingRole);

  function handleSwitchRole(role) {
    if (session.demo && switchDemoRole) {
      const target = switchDemoRole(role);
      if (target) {
        if (workspace?.applyDemoRoleSwitch) {
          workspace.applyDemoRoleSwitch(role);
        }
        if (workspace?.showToast) {
          workspace.showToast(`Switched to ${role} (demo)`);
        }
        navigate(target);
      }
      return;
    }
    if (switchRole(role)) {
      navigate(getHomeRouteForRole(role));
    }
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const home = getHomeRouteForRole(session.actingRole);
  const areaLabel = location.pathname.startsWith("/admin")
    ? "Admin"
    : session.actingRole === ROLES.MITIGATION_OWNER
      ? "Mitigations"
      : "Workspace";

  return (
    <div
      className="min-h-screen text-zinc-900"
      style={{ background: "#F1F2F4", fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif" }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <header className="app-topbar sticky top-0 z-30">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <Link to={home} className="flex shrink-0 items-center gap-2">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-md"
              style={{ background: "#F59E0B" }}
            >
              <Shield size={13} strokeWidth={2.5} style={{ color: "#1E3A5F" }} aria-hidden />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">Vantage</span>
          </Link>

          <div className="hidden h-4 w-px bg-white/20 sm:block" aria-hidden />

          <nav
            aria-label="Primary"
            className="hidden min-w-0 items-center gap-0.5 overflow-x-auto text-sm sm:flex"
          >
            {navigation.map((item) => (
              <NavTab key={item.to} to={item.to} end={item.to === "/dashboard"}>
                {item.label}
              </NavTab>
            ))}
          </nav>

          <p className="truncate text-xs font-medium uppercase tracking-wide text-white/50 sm:hidden">
            {areaLabel}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <NotificationDropdown actingRole={session.actingRole} unreadCount={unreadCount} />

          <RoleSwitcher session={session} onSwitchRole={handleSwitchRole} />

          <div className="hidden h-4 w-px bg-white/20 sm:block" aria-hidden />

          <div className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{ background: "#F59E0B", color: "#1E3A5F" }}
            >
              {session.user.initials}
            </span>
            <span className="hidden text-left text-[12px] leading-tight sm:block">
              <span className="block font-medium text-white">{session.user.name}</span>
              <span className="block text-[10px] text-white/60">{session.actingRole}</span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="ml-1 rounded p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={13} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {!session.mfaSatisfied ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[11px] font-medium text-amber-800">
          MFA challenge pending — sensitive actions are blocked until you complete TOTP verification.
        </div>
      ) : null}

      <main id="main" className="px-4 py-5 sm:px-5 lg:px-6 lg:py-6">
        <div className="mx-auto w-full max-w-[1200px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
