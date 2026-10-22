/** Configuration for the CloudTel PBX admin service. */
export function loadConfig(env = process.env) {
  const required = ["ARI_URL", "ARI_USERNAME", "ARI_PASSWORD", "PBX_API_USERNAME", "PBX_API_PASSWORD"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return {
    port: Number.parseInt(env.PORT || "8090", 10),
    bindAddress: env.BIND_ADDRESS || "127.0.0.1",
    ariUrl: env.ARI_URL.replace(/\/+$/, ""),
    ariUser: env.ARI_USERNAME,
    ariPassword: env.ARI_PASSWORD,
    apiUser: env.PBX_API_USERNAME,
    apiPassword: env.PBX_API_PASSWORD,
    includeDir: env.PJSIP_INCLUDE_DIR || "/etc/asterisk/pjsip.d",
    includeFile: env.PJSIP_INCLUDE_FILE || "cloudtel.conf",
    stateFile: env.STATE_FILE || "/var/lib/cloudtel-pbx/extensions.json",
    context: env.PJSIP_CONTEXT || "cloudtel-internal",
    sipDomain: env.SIP_DOMAIN || "",
  };
}
