export const DEFAULT_ASSETS = Object.freeze([
  {
    id: "asset-marine-loading",
    name: "Marine Loading Terminal",
    type: "Marine Loading Terminal",
    description:
      "Primary jetty and metering skids handling product loading to vessels. Supports up to 8,000 m3/h.",
    dependencies: ["asset-control-room", "asset-utility-substation", "External: vessel traffic services"],
    consequences:
      "Loss-of-life potential, multi-day production stoppage, environmental release into estuary, regulatory loss-of-license risk.",
    criticality: "Very High"
  },
  {
    id: "asset-tank-farm",
    name: "Storage Tank Farm",
    type: "Storage Tank Farm",
    description: "Eight floating-roof tanks storing finished product and intermediate fractions.",
    dependencies: ["asset-control-room", "asset-utility-substation"],
    consequences: "Major fire / loss-of-containment event with environmental and reputational impact.",
    criticality: "Very High"
  },
  {
    id: "asset-control-room",
    name: "Central Control Room",
    type: "Control Room",
    description: "DCS / SCADA hub controlling 95% of plant operations on redundant servers.",
    dependencies: ["asset-utility-substation", "External: telecom links"],
    consequences:
      "Total loss of operational control. Potential safety-system bypass exposure depending on fallback.",
    criticality: "Very High"
  },
  {
    id: "asset-utility-substation",
    name: "Utility Substation",
    type: "Utility Substation",
    description: "33kV substation feeding all critical units with two redundant feeders.",
    dependencies: ["External: national grid"],
    consequences: "Loss of power across critical units; safety systems on UPS for limited duration.",
    criticality: "High"
  },
  {
    id: "asset-fuel-skid",
    name: "Fuel Loading Skid",
    type: "Fuel Loading Skid",
    description: "Truck-loading bays for downstream distribution including manual gantries.",
    dependencies: ["asset-tank-farm"],
    consequences: "Theft and diversion losses; spill risk during loading.",
    criticality: "Medium"
  },
  {
    id: "asset-admin-building",
    name: "Administration Building",
    type: "Administration Building",
    description: "Office building including HR, finance, and visitor reception.",
    dependencies: ["External: corporate IT"],
    consequences: "Information loss, business disruption, reputational damage.",
    criticality: "Low"
  }
]);
