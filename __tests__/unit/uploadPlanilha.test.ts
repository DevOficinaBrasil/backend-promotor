import { isPlanilhaValida } from "../../middlewares/uploadPlanilha";

describe("uploadPlanilha", () => {
  describe("isPlanilhaValida", () => {
    it("should accept a .xlsx filename", () => {
      expect(isPlanilhaValida("oficinas.xlsx")).toBe(true);
    });

    it("should accept a .csv filename", () => {
      expect(isPlanilhaValida("oficinas.csv")).toBe(true);
    });

    it("should accept extensions regardless of case", () => {
      expect(isPlanilhaValida("OFICINAS.XLSX")).toBe(true);
      expect(isPlanilhaValida("oficinas.CSV")).toBe(true);
    });

    it("should reject a .xls filename", () => {
      expect(isPlanilhaValida("oficinas.xls")).toBe(false);
    });

    it("should reject a .txt filename", () => {
      expect(isPlanilhaValida("oficinas.txt")).toBe(false);
    });

    it("should reject a filename with no extension", () => {
      expect(isPlanilhaValida("oficinas")).toBe(false);
    });
  });
});
