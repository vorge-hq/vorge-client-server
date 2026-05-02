export const OPERATORS = Object.freeze([
  { id: "op-northstar", name: "Northstar Energy" },
  { id: "op-meridian", name: "Meridian Maritime" }
]);

export const FACILITIES = Object.freeze([
  {
    id: "fac-bonny-refinery",
    operatorId: "op-northstar",
    name: "Bonny Refinery",
    type: "Refinery",
    region: "Niger Delta, Nigeria",
    accountableManager: "Adaeze Okeke",
    regulated: true,
    regulator: "Nigerian Maritime & Safety Agency",
    handoverComplete: true
  },
  {
    id: "fac-coral-fpso",
    operatorId: "op-northstar",
    name: "Coral FPSO",
    type: "FPSO",
    region: "Offshore Mozambique",
    accountableManager: "Joaquim Ribeiro",
    regulated: true,
    regulator: "INP Mozambique",
    handoverComplete: false
  },
  {
    id: "fac-port-azura",
    operatorId: "op-meridian",
    name: "Port Azura Terminal",
    type: "Marine Terminal",
    region: "Mediterranean, Italy",
    accountableManager: "Lucia Romano",
    regulated: true,
    regulator: "Italian Coast Guard / ISPS",
    handoverComplete: true
  }
]);
