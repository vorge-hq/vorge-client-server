export const OPERATORS = Object.freeze([
  { id: "op-a", name: "Operator A" }
]);

export const FACILITIES = Object.freeze([
  {
    id: "fac-1",
    operatorId: "op-a",
    name: "Asset Site 1",
    displayName: "Operator A — Lagos Refinery",
    type: "Refinery",
    region: "Lagos, Nigeria",
    accountableManager: "C. Adeyemi",
    regulated: true,
    regulator: "Department of Petroleum Resources",
    handoverComplete: true,
    isPrimary: true
  },
  {
    id: "fac-2",
    operatorId: "op-a",
    name: "Asset Site 2",
    displayName: "Operator A — Bonny Terminal",
    type: "Marine Terminal",
    region: "Rivers State, Nigeria",
    accountableManager: "J. Onyema",
    regulated: true,
    regulator: "Nigerian Maritime Administration",
    handoverComplete: true
  },
  {
    id: "fac-3",
    operatorId: "op-a",
    name: "Asset Site 3",
    displayName: "Operator A — Port Harcourt Depot",
    type: "Depot",
    region: "Rivers State, Nigeria",
    accountableManager: "B. Onuoha",
    regulated: true,
    regulator: "Department of Petroleum Resources",
    handoverComplete: true
  },
  {
    id: "fac-4",
    operatorId: "op-a",
    name: "Asset Site 4",
    displayName: "Operator A — Asset Site 4",
    type: "Process Facility",
    region: "Niger Delta",
    accountableManager: "—",
    regulated: true,
    regulator: "Department of Petroleum Resources",
    handoverComplete: false
  },
  {
    id: "fac-5",
    operatorId: "op-a",
    name: "Asset Site 5",
    displayName: "Operator A — Asset Site 5",
    type: "Process Facility",
    region: "Niger Delta",
    accountableManager: "—",
    regulated: true,
    regulator: "Department of Petroleum Resources",
    handoverComplete: true
  }
]);
