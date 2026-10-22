/** Entry point for the CloudTel PBX admin service. */
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const config = loadConfig();
const server = createServer(config);

server.listen(config.port, config.bindAddress, () => {
  console.log(`[pbx-admin] listening on http://${config.bindAddress}:${config.port}`);
  console.log(`[pbx-admin] ARI ${config.ariUrl}; include dir ${config.includeDir}`);
});
