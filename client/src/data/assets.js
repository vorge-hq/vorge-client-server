export const DEFAULT_ASSETS = Object.freeze([
  {
    id: "a1",
    name: "Asset 1",
    type: "Process Unit",
    description: "Primary processing facility handling main throughput operations.",
    dependencies: "Asset 6 (power), Asset 3",
    consequences: "Production halt, potential injury, environmental release",
    criticality: "Very High"
  },
  {
    id: "a2",
    name: "Asset 2",
    type: "Storage Tank Farm",
    description: "Bulk storage tanks for finished and intermediate product.",
    dependencies: "Asset 4",
    consequences: "Loss of inventory, environmental damage, fire risk",
    criticality: "High"
  },
  {
    id: "a3",
    name: "Asset 3",
    type: "Control Room",
    description: "Centralised SCADA and process control systems.",
    dependencies: "Asset 6",
    consequences: "Loss of operational control, safety system failure",
    criticality: "Very High"
  },
  {
    id: "a4",
    name: "Asset 4",
    type: "Marine Loading Terminal",
    description: "Jetty and marine loading arms for export shipments.",
    dependencies: "Asset 2",
    consequences: "Export disruption, vessel incident, marine pollution",
    criticality: "High"
  },
  {
    id: "a5",
    name: "Asset 5",
    type: "Administration Building",
    description: "Office facilities, meeting rooms, document storage.",
    dependencies: "—",
    consequences: "Minor disruption, document loss",
    criticality: "Low"
  },
  {
    id: "a6",
    name: "Asset 6",
    type: "Utility Substation",
    description: "Primary electrical substation feeding the facility.",
    dependencies: "External grid",
    consequences: "Total facility shutdown, safety system loss",
    criticality: "Very High"
  },
  {
    id: "a7",
    name: "Asset 7",
    type: "Fuel Loading Skid",
    description: "Mobile fuel transfer skid used for routine bunkering operations.",
    dependencies: "Asset 2",
    consequences: "Potential fatality, major fire, environmental release",
    criticality: "Medium"
  }
]);

const SEVERE_KEYWORDS = [
  "fatal",
  "fatality",
  "death",
  "kill",
  "major",
  "massive",
  "catastrophic",
  "severe",
  "environmental",
  "shutdown",
  "safety"
];

export function detectAssetAnomaly(asset) {
  if (!asset || !asset.criticality || !asset.consequences) return null;
  const text = String(asset.consequences).toLowerCase();
  const matched = SEVERE_KEYWORDS.filter((k) => text.includes(k));
  if (matched.length === 0) return null;
  if (asset.criticality === "Low" || asset.criticality === "Medium") {
    return `Criticality marked ${asset.criticality}, but consequences mention "${matched
      .slice(0, 2)
      .join('", "')}". Consider raising.`;
  }
  return null;
}
