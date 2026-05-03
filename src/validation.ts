/**
 * Client-side validation for Phase-3 set_* tools. Mirrors host
 * validateCustomerConfig — we run BOTH (client + host) so bad calls
 * fail fast and host server gets a defense-in-depth.
 */

import {
  ALLOWED_ALERT_THRESHOLDS,
  ALLOWED_REPORT_STYLES,
  CONFIG_LIMITS,
  McpStudioMeyerError,
  type CustomerCustomConfig,
} from "./types.js";

function checkString(value: string, field: string, max: number): void {
  if (value.length === 0) {
    throw new McpStudioMeyerError(`${field} darf nicht leer sein`, "config-empty");
  }
  if (value.length > max) {
    throw new McpStudioMeyerError(`${field} ist zu lang (max ${max} Zeichen, ist ${value.length})`, "config-too-long");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b-\x0c\x0e-\x1f]/.test(value)) {
    throw new McpStudioMeyerError(`${field} enthaelt Steuerzeichen`, "config-control-chars");
  }
}

export function validateConfigPatch(patch: Partial<CustomerCustomConfig>): void {
  if (patch.focusTopics) {
    if (patch.focusTopics.length > CONFIG_LIMITS.maxFocusTopics) {
      throw new McpStudioMeyerError(
        `focusTopics zu viele (max ${CONFIG_LIMITS.maxFocusTopics}, du hast ${patch.focusTopics.length})`,
        "config-quota-exceeded",
      );
    }
    patch.focusTopics.forEach((t, i) => checkString(t, `focusTopics[${i}]`, CONFIG_LIMITS.maxFocusTopicLen));
  }
  if (patch.keywordPriorities) {
    if (patch.keywordPriorities.length > CONFIG_LIMITS.maxKeywordPriorities) {
      throw new McpStudioMeyerError(
        `keywordPriorities zu viele (max ${CONFIG_LIMITS.maxKeywordPriorities})`,
        "config-quota-exceeded",
      );
    }
    patch.keywordPriorities.forEach((k, i) => checkString(k, `keywordPriorities[${i}]`, CONFIG_LIMITS.maxKeywordLen));
  }
  if (patch.additionalCompetitors) {
    if (patch.additionalCompetitors.length > CONFIG_LIMITS.maxAdditionalCompetitors) {
      throw new McpStudioMeyerError(
        `additionalCompetitors zu viele (max ${CONFIG_LIMITS.maxAdditionalCompetitors})`,
        "config-quota-exceeded",
      );
    }
    patch.additionalCompetitors.forEach((c, i) => checkString(c, `additionalCompetitors[${i}]`, CONFIG_LIMITS.maxCompetitorLen));
  }
  if (patch.excludedCompetitors) {
    if (patch.excludedCompetitors.length > CONFIG_LIMITS.maxExcludedCompetitors) {
      throw new McpStudioMeyerError(
        `excludedCompetitors zu viele (max ${CONFIG_LIMITS.maxExcludedCompetitors})`,
        "config-quota-exceeded",
      );
    }
    patch.excludedCompetitors.forEach((c, i) => checkString(c, `excludedCompetitors[${i}]`, CONFIG_LIMITS.maxCompetitorLen));
  }
  if (patch.reportStyle !== undefined && patch.reportStyle !== null) {
    if (!(ALLOWED_REPORT_STYLES as readonly string[]).includes(patch.reportStyle)) {
      throw new McpStudioMeyerError(
        `reportStyle ungueltig (erlaubt: ${ALLOWED_REPORT_STYLES.join(", ")})`,
        "config-invalid-value",
      );
    }
  }
  if (patch.alertThreshold !== undefined && patch.alertThreshold !== null) {
    if (!(ALLOWED_ALERT_THRESHOLDS as readonly string[]).includes(patch.alertThreshold)) {
      throw new McpStudioMeyerError(
        `alertThreshold ungueltig (erlaubt: ${ALLOWED_ALERT_THRESHOLDS.join(", ")})`,
        "config-invalid-value",
      );
    }
  }
  if (patch.globalNote !== undefined && patch.globalNote !== null && patch.globalNote !== "") {
    checkString(patch.globalNote, "globalNote", CONFIG_LIMITS.maxGlobalNoteLen);
  }
}
