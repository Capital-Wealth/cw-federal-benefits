/**
 * Centralized configuration — no hardcoded values in source files.
 *
 * All environment-dependent values read from process.env.
 * All business-logic constants are named and documented.
 */

// ============================================================
// Environment Helpers
// ============================================================

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

const isDev = process.env.NODE_ENV !== "production";

// ============================================================
// App URLs
// ============================================================

export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) return url;
  if (isDev) return "http://localhost:3000";
  throw new Error("NEXT_PUBLIC_APP_URL must be set in production");
}

// ============================================================
// Salesforce
// ============================================================

export const SF_CONFIG = {
  get instanceUrl(): string {
    return required("SF_INSTANCE_URL");
  },
  get loginUrl(): string {
    return optional("SF_LOGIN_URL", "https://login.salesforce.com");
  },
  get oauthTokenUrl(): string {
    return `${SF_CONFIG.loginUrl}/services/oauth2/token`;
  },
  get username(): string | undefined {
    return process.env.SF_USERNAME;
  },
  get password(): string | undefined {
    return process.env.SF_PASSWORD;
  },
  get securityToken(): string {
    return process.env.SF_SECURITY_TOKEN || "";
  },
  get accessToken(): string | undefined {
    return process.env.SF_ACCESS_TOKEN;
  },
  get consumerKey(): string | undefined {
    return process.env.SF_CONSUMER_KEY;
  },
  get consumerSecret(): string | undefined {
    return process.env.SF_CONSUMER_SECRET;
  },
  cliOrgAlias: optional("SF_CLI_ORG_ALIAS", "cw"),
  tokenCacheMs: parseInt(optional("SF_TOKEN_CACHE_MINUTES", "90")) * 60 * 1000,
  cliTimeoutMs: parseInt(optional("SF_CLI_TIMEOUT_MS", "10000")),

  /** The custom object API name — schema contract with Salesforce */
  objectName: "Federal_Benefits_Intake__c" as const,
};

// ============================================================
// Supabase
// ============================================================

export const SUPABASE_CONFIG = {
  get url(): string {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get anonKey(): string {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get serviceRoleKey(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  storageBucket: optional("SUPABASE_STORAGE_BUCKET", "federal-docs"),
};

// ============================================================
// AI Document Parsing
// ============================================================

export const PARSE_CONFIG = {
  timeoutMs: parseInt(optional("AI_PARSE_TIMEOUT_MS", "120000")),
  maxBufferBytes: parseInt(optional("AI_PARSE_MAX_BUFFER", String(10 * 1024 * 1024))),
  confidenceThreshold: parseInt(optional("AI_CONFIDENCE_THRESHOLD", "70")),
};

// ============================================================
// Upload
// ============================================================

export const UPLOAD_CONFIG = {
  maxFileSizeBytes: parseInt(optional("MAX_UPLOAD_SIZE_BYTES", String(50 * 1024 * 1024))),
  allowedMimeTypes: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

// ============================================================
// Report Builder API
// ============================================================

export const REPORT_BUILDER_CONFIG = {
  get apiKey(): string | undefined {
    return process.env.REPORT_BUILDER_API_KEY;
  },
};

// ============================================================
// Federal Retirement Constants (OPM / Federal Law)
// ============================================================

/** OPM standard work hours per year */
export const HOURS_PER_YEAR = 2087;

/** Federal pay periods per year (biweekly) */
export const PAY_PERIODS_PER_YEAR = 26;

export const MONTHS_PER_YEAR = 12;

/** FERS pension multiplier: 1% for standard retirement */
export const FERS_MULTIPLIER_STANDARD = 0.01;

/** FERS pension multiplier: 1.1% for age 62+ with 20+ years */
export const FERS_MULTIPLIER_ENHANCED = 0.011;

/** CSRS pension: 1.5% for first 5 years */
export const CSRS_MULTIPLIER_FIRST_5 = 0.015;

/** CSRS pension: 1.75% for years 5-10 */
export const CSRS_MULTIPLIER_NEXT_5 = 0.0175;

/** CSRS pension: 2% for years over 10 */
export const CSRS_MULTIPLIER_OVER_10 = 0.02;

/** CSRS pension cap: 80% of high-3 */
export const CSRS_PENSION_CAP = 0.8;

/** CSRS survivor benefit formula threshold */
export const CSRS_SURVIVOR_THRESHOLD = 3600;

/** FERS supplement: based on 40-year SS divisor */
export const FERS_SUPPLEMENT_SS_DIVISOR = 40;

/** FERS agency TSP match: 5% */
export const FERS_AGENCY_MATCH = 0.05;

// ============================================================
// Business Logic Defaults (configurable)
// ============================================================

/** Default assumed salary increase when not provided */
export const DEFAULT_SALARY_INCREASE_PCT = parseFloat(
  optional("DEFAULT_SALARY_INCREASE_PCT", "2.5")
);

/** Default blended TSP return assumption when no per-fund returns given */
export const DEFAULT_TSP_RETURN_PCT = parseFloat(
  optional("DEFAULT_TSP_RETURN_PCT", "7")
);

/** Default life expectancy in years for withdrawal calculations */
export const DEFAULT_LIFE_EXPECTANCY_YEARS = parseInt(
  optional("DEFAULT_LIFE_EXPECTANCY_YEARS", "25")
);

/** Default TSP annuity interest rate */
export const DEFAULT_ANNUITY_RATE_PCT = parseFloat(
  optional("DEFAULT_ANNUITY_RATE_PCT", "3")
);
