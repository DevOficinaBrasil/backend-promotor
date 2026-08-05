import { enderecoRecente } from "../../service/envioGuards";

// Spec AC26: "IF the route's Oficina has a DATA_ALTERACAO within the last 3
// months THEN the system SHALL set STATUS to DISPENSADO ... and SHALL NOT
// resolve a recipient or attempt a send."
// Spec edge case: "IF Oficina.DATA_ALTERACAO is NULL THEN the address SHALL be
// treated as stale (not fresh)."
describe("enderecoRecente", () => {
  const agora = new Date("2026-08-05T12:00:00.000Z");

  it("returns true for a workshop updated one month ago", () => {
    const oficina = { DATA_ALTERACAO: new Date("2026-07-05T12:00:00.000Z") };

    expect(enderecoRecente(oficina, agora)).toBe(true);
  });

  // Boundary choice: exactly 3 months old still counts as "within the last 3
  // months". The spec does not pin the boundary instant down (spec-precision
  // gap); inclusive is asserted here so the behaviour is pinned by a test.
  it("returns true at exactly the 3-month boundary", () => {
    const oficina = { DATA_ALTERACAO: new Date("2026-05-05T12:00:00.000Z") };

    expect(enderecoRecente(oficina, agora)).toBe(true);
  });

  it("returns false one millisecond before the 3-month boundary", () => {
    const oficina = { DATA_ALTERACAO: new Date("2026-05-05T11:59:59.999Z") };

    expect(enderecoRecente(oficina, agora)).toBe(false);
  });

  it("returns false for a workshop last updated six months ago", () => {
    const oficina = { DATA_ALTERACAO: new Date("2026-02-05T12:00:00.000Z") };

    expect(enderecoRecente(oficina, agora)).toBe(false);
  });

  it("treats a null DATA_ALTERACAO as stale", () => {
    expect(enderecoRecente({ DATA_ALTERACAO: null }, agora)).toBe(false);
  });

  it("treats an absent DATA_ALTERACAO as stale", () => {
    expect(enderecoRecente({}, agora)).toBe(false);
  });

  it("defaults the clock to the current time when agora is not provided", () => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);

    expect(enderecoRecente({ DATA_ALTERACAO: ontem })).toBe(true);
  });
});
