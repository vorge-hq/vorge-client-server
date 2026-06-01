export const OPERATORS = Object.freeze([
  { id: "op-a", name: "Operator A" }
]);

export const FACILITIES = Object.freeze([
  {
    id: "fac-1",
    operatorId: "op-a",
    name: "Eko Petrochemical Hub",
    displayName: "Operator A — Eko Petrochemical Hub",
    type: "Refinery",
    region: "Lagos, Nigeria",
    accountableManager: "Daniel Mensah",
    regulated: true,
    regulator: "Department of Petroleum Resources",
    handoverComplete: true,
    isPrimary: true
  },
  {
    id: "fac-2",
    operatorId: "op-a",
    name: "Delta Crest Terminal",
    displayName: "Operator A — Delta Crest Terminal",
    type: "Marine Terminal",
    region: "Rivers State, Nigeria",
    accountableManager: "Hassan Al-Mansoori",
    regulated: true,
    regulator: "Nigerian Maritime Administration",
    handoverComplete: true
  },
  {
    id: "fac-3",
    operatorId: "op-a",
    name: "Gulf Horizon Terminal",
    displayName: "Operator A — Gulf Horizon Terminal",
    type: "Marine Terminal",
    region: "Fujairah, United Arab Emirates",
    accountableManager: "Nadia Haddad",
    regulated: true,
    regulator: "Federal Transport Authority (UAE)",
    handoverComplete: true
  },
  {
    id: "fac-4",
    operatorId: "op-a",
    name: "Pernis Refinery Complex",
    displayName: "Operator A — Pernis Refinery Complex",
    type: "Refinery",
    region: "Rotterdam, Netherlands",
    accountableManager: "Lukas van der Berg",
    regulated: true,
    regulator: "Dutch Safety Board",
    handoverComplete: false
  },
  {
    id: "fac-5",
    operatorId: "op-a",
    name: "Jurong Storage Terminal",
    displayName: "Operator A — Jurong Storage Terminal",
    type: "Process Facility",
    region: "Jurong Island, Singapore",
    accountableManager: "Wei Lin",
    regulated: true,
    regulator: "Maritime and Port Authority of Singapore",
    handoverComplete: true
  }
]);
