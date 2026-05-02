import { useState } from "react";
import { Banner } from "../../components/Banner";
import { Card, CardHeader } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/icons";
import { KpiCard } from "../../components/KpiCard";
import { PageHeader } from "../../components/PageHeader";
import {
  getOfflineModeMessage,
  isOnlineOnlyFeature
} from "../../features/fieldMode/offlineModel";

const SCOPE_OPTIONS = [
  { id: "section-3", label: "Section 3 — Asset Disaggregation" },
  { id: "section-6-cyber", label: "Section 6 — Cybercrime evaluations" },
  { id: "section-6-maritime", label: "Section 6 — Maritime evaluations" },
  { id: "attachments", label: "Attachments and reference photos" }
];

export function FieldModePage() {
  const [online, setOnline] = useState(true);
  const [hasCheckout, setHasCheckout] = useState(false);
  const [selected, setSelected] = useState(new Set(["section-6-cyber"]));
  const [windowDays, setWindowDays] = useState(3);

  function toggleScope(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow="Field Mode"
        title="Per-section checkout and offline access"
        description="Available on phones, tablets, laptops, and installed PWAs. Pre-authorise offline access before going to site."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={online ? "btn-secondary" : "btn-primary"}
              onClick={() => setOnline((value) => !value)}
            >
              {online ? "Simulate offline" : "Simulate online"}
            </button>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Connection"
          value={online ? "Online" : "Offline"}
          tone={online ? "success" : "warn"}
        />
        <KpiCard
          label="Checkout"
          value={hasCheckout ? `${selected.size} item(s)` : "None"}
          hint={hasCheckout ? "Locked to your device until sync" : "No records checked out"}
        />
        <KpiCard
          label="Pending sync"
          value={hasCheckout && !online ? selected.size : 0}
          tone={hasCheckout && !online ? "warn" : "default"}
        />
      </section>

      <Banner tone={online ? "info" : "warn"} title={online ? "Online" : "Offline"}>
        {getOfflineModeMessage({ isOnline: online, hasCheckout, syncQueueLength: hasCheckout && !online ? selected.size : 0 })}
      </Banner>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            eyebrow="Step 1"
            title="Choose checkout scope"
            description="Other team members see 'checked out by you' on locked records."
          />
          <ul className="mt-4 grid gap-2">
            {SCOPE_OPTIONS.map((option) => {
              const checked = selected.has(option.id);
              return (
                <li key={option.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 hover:border-vantage-navy">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleScope(option.id)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 text-sm text-slate-800">{option.label}</span>
                    {checked ? <Chip tone="info">Selected</Chip> : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn-primary mt-4 w-full justify-center"
            onClick={() => setHasCheckout(true)}
            disabled={selected.size === 0}
          >
            <Icon name="check" className="h-4 w-4" /> Confirm offline package
          </button>
        </Card>

        <Card>
          <CardHeader
            eyebrow="Step 2"
            title="Pre-authorise offline access"
            description="Bind a PIN or biometric to this device. Server signs the offline window and binds it to the device fingerprint."
          />
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="field-label">Offline window</span>
              <select
                className="field-control"
                value={windowDays}
                onChange={(event) => setWindowDays(Number(event.target.value))}
              >
                {[1, 3, 5, 7].map((days) => (
                  <option key={days} value={days}>
                    {days} day{days === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" className="btn-secondary justify-center">
                Set PIN
              </button>
              <button type="button" className="btn-secondary justify-center">
                Use biometric
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Failed-attempt threshold: 5. Your offline cache wipes on threshold breach. Audit entries
            push when you reconnect.
          </p>
        </Card>

        <Card>
          <CardHeader eyebrow="Online-only" title="Features that stay online-only" />
          <ul className="mt-4 grid gap-2 text-sm text-slate-700">
            {[
              ["approvals", "Approval workflow actions (submit, mark complete, approve, reject)"],
              ["hq-dashboard", "HQ Executive dashboards and cross-facility comparisons"],
              ["ai", "AI-drafted summaries, anomaly detection, and other AI features"]
            ].map(([id, label]) => (
              <li key={id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <span>{label}</span>
                <Chip tone={isOnlineOnlyFeature(id) ? "warn" : "slate"}>
                  {isOnlineOnlyFeature(id) ? "Online only" : "Available offline"}
                </Chip>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader eyebrow="Sync queue" title="Pending changes" />
          {hasCheckout && !online ? (
            <ul className="mt-4 grid gap-2 text-sm">
              {Array.from(selected).map((scope) => (
                <li key={scope} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  Local edits to {SCOPE_OPTIONS.find((s) => s.id === scope)?.label} (queued)
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No pending changes. Sync queue is empty.</p>
          )}
          <button
            type="button"
            className="btn-primary mt-4 w-full justify-center"
            onClick={() => {
              setOnline(true);
              setHasCheckout(false);
              setSelected(new Set());
            }}
            disabled={!hasCheckout}
          >
            Sync now
          </button>
        </Card>
      </section>
    </section>
  );
}
