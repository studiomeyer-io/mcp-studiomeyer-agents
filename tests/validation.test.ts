import { describe, expect, it } from "vitest";
import { validateConfigPatch } from "../src/validation.js";
import { McpStudioMeyerError } from "../src/types.js";

describe("validateConfigPatch", () => {
  it("accepts empty patch", () => {
    expect(() => validateConfigPatch({})).not.toThrow();
  });

  describe("focusTopics", () => {
    it("accepts max 5 entries", () => {
      expect(() => validateConfigPatch({ focusTopics: ["a", "b", "c", "d", "e"] })).not.toThrow();
    });

    it("rejects 6 entries", () => {
      expect(() => validateConfigPatch({ focusTopics: ["a", "b", "c", "d", "e", "f"] }))
        .toThrowError(McpStudioMeyerError);
    });

    it("rejects entry > 100 chars", () => {
      const long = "x".repeat(101);
      expect(() => validateConfigPatch({ focusTopics: [long] })).toThrowError(/zu lang/);
    });

    it("rejects empty string", () => {
      expect(() => validateConfigPatch({ focusTopics: [""] })).toThrowError(/leer/);
    });

    it("rejects control characters", () => {
      expect(() => validateConfigPatch({ focusTopics: ["bad\x00null"] })).toThrowError(/Steuerzeichen/);
    });
  });

  describe("keywordPriorities", () => {
    it("accepts max 10 entries", () => {
      expect(() => validateConfigPatch({ keywordPriorities: Array(10).fill("kw") })).not.toThrow();
    });
    it("rejects 11 entries", () => {
      expect(() => validateConfigPatch({ keywordPriorities: Array(11).fill("kw") }))
        .toThrowError(/zu viele/);
    });
    it("rejects entry > 80 chars", () => {
      expect(() => validateConfigPatch({ keywordPriorities: ["x".repeat(81)] }))
        .toThrowError(/zu lang/);
    });
  });

  describe("competitors", () => {
    it("accepts max 10 additional", () => {
      expect(() => validateConfigPatch({ additionalCompetitors: Array(10).fill("c") })).not.toThrow();
    });
    it("rejects 11 additional", () => {
      expect(() => validateConfigPatch({ additionalCompetitors: Array(11).fill("c") }))
        .toThrowError(/zu viele/);
    });
    it("accepts max 10 excluded", () => {
      expect(() => validateConfigPatch({ excludedCompetitors: Array(10).fill("c") })).not.toThrow();
    });
    it("rejects 11 excluded", () => {
      expect(() => validateConfigPatch({ excludedCompetitors: Array(11).fill("c") }))
        .toThrowError(/zu viele/);
    });
  });

  describe("reportStyle", () => {
    it("accepts each allowed value", () => {
      for (const style of ["formal", "locker", "kompakt", "ausfuehrlich"] as const) {
        expect(() => validateConfigPatch({ reportStyle: style })).not.toThrow();
      }
    });
    it("rejects invalid value", () => {
      // @ts-expect-error testing runtime guard
      expect(() => validateConfigPatch({ reportStyle: "casual" }))
        .toThrowError(/ungueltig/);
    });
  });

  describe("alertThreshold", () => {
    it("accepts each allowed value", () => {
      for (const t of ["very-low", "low", "normal", "high"] as const) {
        expect(() => validateConfigPatch({ alertThreshold: t })).not.toThrow();
      }
    });
    it("rejects invalid value", () => {
      // @ts-expect-error testing runtime guard
      expect(() => validateConfigPatch({ alertThreshold: "extreme" }))
        .toThrowError(/ungueltig/);
    });
  });

  describe("globalNote", () => {
    it("accepts up to 500 chars", () => {
      expect(() => validateConfigPatch({ globalNote: "x".repeat(500) })).not.toThrow();
    });
    it("rejects > 500 chars", () => {
      expect(() => validateConfigPatch({ globalNote: "x".repeat(501) })).toThrowError(/zu lang/);
    });
    it("accepts empty string (clear-out semantics)", () => {
      expect(() => validateConfigPatch({ globalNote: "" })).not.toThrow();
    });
  });

  describe("error codes", () => {
    it("config-quota-exceeded for too-many", () => {
      try {
        validateConfigPatch({ focusTopics: Array(6).fill("a") });
        expect.fail("should throw");
      } catch (err) {
        expect(err).toBeInstanceOf(McpStudioMeyerError);
        expect((err as McpStudioMeyerError).code).toBe("config-quota-exceeded");
      }
    });
    it("config-too-long for over-length", () => {
      try {
        validateConfigPatch({ focusTopics: ["x".repeat(101)] });
        expect.fail("should throw");
      } catch (err) {
        expect((err as McpStudioMeyerError).code).toBe("config-too-long");
      }
    });
    it("config-invalid-value for bad enum", () => {
      try {
        // @ts-expect-error
        validateConfigPatch({ reportStyle: "casual" });
        expect.fail("should throw");
      } catch (err) {
        expect((err as McpStudioMeyerError).code).toBe("config-invalid-value");
      }
    });
  });
});
