/** Configuration for the ARI bridge, resolved from environment variables. */
export function loadConfig(env = process.env) {
  const required = ["ARI_URL", "ARI_USERNAME", "ARI_PASSWORD", "CLOUDTEL_WEBHOOK_URL", "TELEPHONY_WEBHOOK_SECRET"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return {
    ariUrl: env.ARI_URL,
    ariUser: env.ARI_USERNAME,
    ariPassword: env.ARI_PASSWORD,
    stasisApp: env.ARI_STASIS_APP || "cloudtel",
    webhookUrl: env.CLOUDTEL_WEBHOOK_URL,
    webhookSecret: env.TELEPHONY_WEBHOOK_SECRET,
    organisationId: env.CLOUDTEL_ORGANISATION_ID || undefined,
    requestTimeoutMs: Number.parseInt(env.WEBHOOK_TIMEOUT_MS || "5000", 10),
    maxRetries: Number.parseInt(env.WEBHOOK_MAX_RETRIES || "5", 10),
    recordingBaseUrl: env.RECORDING_BASE_URL || undefined,
  };
}
