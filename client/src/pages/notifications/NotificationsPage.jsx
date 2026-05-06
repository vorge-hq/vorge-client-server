import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Card, CardHeader } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { filterForRole, getNotificationToneClasses } from "../../features/notifications/notificationModel";

export function NotificationsPage() {
  const { session } = useAuth();
  const workspace = useWorkspace();
  const items = filterForRole(workspace.notifications, session.actingRole);
  const unread = items.filter((item) => !item.read);

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow="Notifications"
        title="Tasks and alerts"
        description="Workflow events, mitigation overdue, AI flags, and lock notifications relevant to your acting role."
        meta={
          <>
            <Chip tone="info">{unread.length} unread</Chip>
            <Chip>{items.length} total</Chip>
          </>
        }
      />

      <Card>
        <CardHeader eyebrow="Inbox" title="All notifications" />
        {items.length === 0 ? (
          <EmptyState
            title="Inbox empty"
            description="You're all caught up."
          />
        ) : (
          <ul className="mt-4 grid gap-3">
            {items.map((notification) => (
              <li
                key={notification.id}
                className={`rounded-xl border p-4 ${getNotificationToneClasses(notification.severity)}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{notification.title}</p>
                    <p className="mt-1 text-sm">{notification.body}</p>
                    <p className="mt-2 text-xs opacity-80">
                      {new Date(notification.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!notification.read ? <Chip tone="dark">New</Chip> : null}
                    <Link to={notification.href} className="btn-secondary">
                      Open
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
