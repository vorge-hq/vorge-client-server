import { useMemo } from "react";
import { getEvaluationStatus } from "./assessmentModel";

/* Visual mapping for the four cell states. Both color AND symbol are
   used so colorblind users can distinguish complete / in-progress /
   missing without relying on hue. */
const STATE_STYLES = {
  unscoped: {
    cellClass: "border-border-default bg-surface-base hover:bg-surface-muted",
    symbol: null,
    label: "Not in scope"
  },
  missing: {
    cellClass: "border-border-strong bg-border-strong text-surface-base",
    symbol: "ring",
    label: "Ticked, no evaluation yet"
  },
  "in-progress": {
    cellClass:
      "border-severity-medium-fill bg-severity-medium-fill text-severity-medium-text",
    symbol: "half",
    label: "In progress"
  },
  complete: {
    cellClass: "border-severity-low-fill bg-severity-low-fill text-surface-base",
    symbol: "solid",
    label: "Complete"
  }
};

function CellSymbol({ symbol, size }) {
  if (!symbol) return null;
  const dim = Math.max(6, Math.round(size * 0.45));
  switch (symbol) {
    case "ring":
      return (
        <span
          aria-hidden
          className="rounded-full border-2 border-current"
          style={{ width: dim, height: dim }}
        />
      );
    case "half":
      return (
        <span
          aria-hidden
          className="rounded-full border-2 border-current"
          style={{
            width: dim,
            height: dim,
            background: "linear-gradient(90deg, currentColor 50%, transparent 50%)"
          }}
        />
      );
    case "solid":
      return (
        <span
          aria-hidden
          className="rounded-full bg-current"
          style={{ width: dim, height: dim }}
        />
      );
    default:
      return null;
  }
}

function tooltipFor({ asset, threat, state }) {
  const label = STATE_STYLES[state]?.label || state;
  return `${asset?.name || "Asset"} × ${threat?.name || threat?.short || threat?.classification || "Threat"} — ${label}`;
}

/**
 * Shared matrix component used in both Section 5 (mode="edit") and
 * Section 6's sidebar (mode="compact").
 *
 * Cell states are derived from `matrix` (scope) and `evaluations`
 * (completion). The parent decides what happens on click via
 * `onCellClick(assetId, threatId, state)` so this component stays
 * presentation-only.
 */
export function AssetThreatMatrix({
  assets = [],
  threats = [],
  matrix = {},
  evaluations = [],
  mode = "edit",
  focusedKey = null,
  readOnly = false,
  onCellClick,
  onCellContextMenu
}) {
  const isCompact = mode === "compact";
  const cellSize = isCompact ? 20 : 28;
  const gap = isCompact ? 2 : 4;
  const headerFont = isCompact ? "text-[8px]" : "text-[10px]";
  const assetFont = isCompact ? "text-[10px]" : "text-[12px]";
  const assetWidth = isCompact ? "w-20" : "w-32";

  const evalByKey = useMemo(() => {
    const map = new Map();
    evaluations.forEach((evaluation) => {
      map.set(`${evaluation.assetId}|${evaluation.threatId}`, evaluation);
    });
    return map;
  }, [evaluations]);

  function stateFor(assetId, threatId) {
    const key = `${assetId}|${threatId}`;
    if (!matrix[key]) return "unscoped";
    return getEvaluationStatus(evalByKey.get(key));
  }

  function handleClick(asset, threat) {
    if (readOnly || !onCellClick) return;
    onCellClick(asset.id, threat.id, stateFor(asset.id, threat.id));
  }

  function handleContextMenu(event, asset, threat) {
    if (readOnly || !onCellContextMenu) return;
    event.preventDefault();
    onCellContextMenu(asset.id, threat.id, stateFor(asset.id, threat.id));
  }

  /* Single source of truth for the cell button. Both the table-based
     edit mode and the flex-based compact mode wrap this in their own
     container element. Keeps rendering / state / focus ring / tooltip
     logic consistent across both modes. */
  function renderCell(asset, threat) {
    const state = stateFor(asset.id, threat.id);
    const style = STATE_STYLES[state];
    const key = `${asset.id}|${threat.id}`;
    const isFocused = focusedKey === key;
    const tooltip = tooltipFor({ asset, threat, state });
    return (
      <button
        type="button"
        onClick={() => handleClick(asset, threat)}
        onContextMenu={(event) => handleContextMenu(event, asset, threat)}
        disabled={readOnly}
        aria-label={tooltip}
        title={tooltip}
        className={`flex shrink-0 items-center justify-center rounded-sm border transition-colors ${style.cellClass} ${
          isFocused ? "ring-2 ring-border-focus ring-offset-1 ring-offset-surface-raised" : ""
        } ${readOnly ? "cursor-not-allowed" : "cursor-pointer"}`}
        style={{ width: cellSize, height: cellSize }}
      >
        <CellSymbol symbol={style.symbol} size={cellSize} />
      </button>
    );
  }

  /* Edit mode (Section 5): table-based so columns auto-size to threat
     header text. "Org. Crime", "Civil Unrest", "Armed Conflict" all
     fit cleanly without overlapping each other. */
  if (!isCompact) {
    return (
      <div className="inline-block">
        <table className="border-separate" style={{ borderSpacing: gap }}>
          <thead>
            <tr>
              <th aria-hidden />
              {threats.map((threat) => (
                <th
                  key={threat.id}
                  scope="col"
                  className={`${headerFont} px-1 align-bottom font-semibold uppercase tracking-wide text-text-muted text-center`}
                  title={threat.name || threat.classification}
                >
                  {threat.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id}>
                <th
                  scope="row"
                  className={`${assetFont} pr-3 text-left font-medium text-text-secondary whitespace-nowrap`}
                  title={asset.name}
                >
                  {asset.name}
                </th>
                {threats.map((threat) => (
                  <td key={threat.id} className="p-0 text-center">
                    <span className="inline-flex items-center justify-center">
                      {renderCell(asset, threat)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* Compact mode (Section 6 sidebar): flex-based with abbreviated
     3-char headers. Fits in the 260px sidebar without overflow. */
  return (
    <div className="inline-block">
      {/* Header row: blank corner + threat columns */}
      <div className="flex items-end" style={{ gap }}>
        <div className={assetWidth} aria-hidden />
        {threats.map((threat) => (
          <div
            key={threat.id}
            className={`${headerFont} font-semibold uppercase tracking-wide text-text-muted text-center`}
            style={{ width: cellSize }}
            title={threat.name || threat.classification}
          >
            {(threat.short || threat.classification || "").slice(0, 3)}
          </div>
        ))}
      </div>

      {/* Asset rows */}
      <div className="mt-1 flex flex-col" style={{ gap }}>
        {assets.map((asset) => (
          <div key={asset.id} className="flex items-center" style={{ gap }}>
            <div
              className={`${assetWidth} truncate ${assetFont} font-medium text-text-secondary`}
              title={asset.name}
            >
              {asset.name}
            </div>
            {threats.map((threat) => (
              <span key={threat.id} className="inline-flex">
                {renderCell(asset, threat)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Compact legend — used below the matrix in both modes. */
export function MatrixLegend({ className = "" }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 text-[10px] text-text-muted ${className}`}>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-sm border border-border-default bg-surface-base"
        />
        Not in scope
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-sm border border-border-strong bg-border-strong"
        />
        Missing
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-sm border border-severity-medium-fill bg-severity-medium-fill"
        />
        In progress
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-sm border border-severity-low-fill bg-severity-low-fill"
        />
        Complete
      </span>
    </div>
  );
}

export default AssetThreatMatrix;
