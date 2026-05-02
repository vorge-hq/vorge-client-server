export const DEFAULT_THREATS = Object.freeze([
  {
    id: "threat-organised-crime",
    classification: "Organised Crime",
    history:
      "Persistent regional syndicates operate cargo theft and product diversion in the surrounding province.",
    facilityHistory: "2 confirmed product theft incidents at downstream loading bays in the past 18 months.",
    capabilityIntent: "Moderate capability, opportunistic intent driven by black-market product pricing.",
    rating: "High"
  },
  {
    id: "threat-criminality",
    classification: "Criminality",
    history: "General opportunistic crime including vehicle theft, equipment theft, and trespass.",
    facilityHistory: "Routine perimeter intrusions; no major incidents in 24 months.",
    capabilityIntent: "Low capability, high frequency.",
    rating: "Medium"
  },
  {
    id: "threat-civil-unrest",
    classification: "Civil / Community Unrest",
    history: "Local community unrest tied to land use, employment, and royalties.",
    facilityHistory: "One temporary access blockade in 2024.",
    capabilityIntent: "Low capability, episodic.",
    rating: "Medium"
  },
  {
    id: "threat-armed-conflicts",
    classification: "Armed Conflicts",
    history: "Regional militant activity has trended down since 2022 but remains a residual risk.",
    facilityHistory: "No direct incidents at facility.",
    capabilityIntent: "High capability if mobilised, low current intent.",
    rating: "Low"
  },
  {
    id: "threat-terrorism",
    classification: "Terrorism",
    history: "International watchlists flag the wider region as elevated.",
    facilityHistory: "No direct incidents at facility.",
    capabilityIntent: "High capability, low specific targeting.",
    rating: "Medium"
  },
  {
    id: "threat-cybercrime",
    classification: "Cybercrime & Data Breaches",
    history: "Operator suffered a credential-stuffing campaign targeting OT engineers in 2025.",
    facilityHistory: "Two phishing attempts targeting site managers in the past 6 months.",
    capabilityIntent: "Sophisticated state-aligned and criminal actors.",
    rating: "Very High"
  },
  {
    id: "threat-insider",
    classification: "Insider",
    history: "Industry baseline indicates 4-7% insider involvement in major loss events.",
    facilityHistory: "One disciplinary action for unauthorised data access in 2024.",
    capabilityIntent: "Variable capability depending on role.",
    rating: "Medium"
  },
  {
    id: "threat-maritime",
    classification: "Maritime",
    history: "Regional piracy has decreased significantly since 2022 multinational naval operations.",
    facilityHistory: "Vessel approach incidents 4-6 nautical miles offshore but no boarding.",
    capabilityIntent: "Reduced capability; opportunistic intent persists.",
    rating: "Medium"
  }
]);
