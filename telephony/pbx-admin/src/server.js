/** HTTP server implementing the PBX administrative API consumed by CloudTel. */
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAri } from "./ari.js";
import { createStore } from "./store.js";
import {
  generateSipPassword,
  isValidNumber,
  renderPjsipInclude,
  sanitiseDisplayName,
} from "./pjsip.js";

const MAX_BODY_BYTES = 64 * 1024;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

/**
 * @param {ReturnType<typeof import("./config.js").loadConfig>} config
 */
export function createServer(config, { logger = console } = {}) {
  const store = createStore(config.stateFile);
  const ari = createAri({ baseUrl: config.ariUrl, username: config.ariUser, password: config.ariPassword });
  let applyChain = Promise.resolve();

  async function writeInclude() {
    const extensions = await store.list();
    const contents = renderPjsipInclude(extensions, { context: config.context });
    await mkdir(config.includeDir, { recursive: true });
    const target = path.join(config.includeDir, config.includeFile);
    const tmp = `${target}.tmp`;
    await writeFile(tmp, contents, { mode: 0o644 });
    await rename(tmp, target);
    return contents;
  }

  /** Serialise config writes + reloads so concurrent API calls cannot race. */
  function apply() {
    applyChain = applyChain.then(async () => {
      await writeInclude();
      await ari.reloadPjsip();
    });
    return applyChain;
  }

  function authorised(req) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Basic ")) return false;
    let decoded;
    try {
      decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    } catch {
      return false;
    }
    const index = decoded.indexOf(":");
    if (index === -1) return false;
    const user = decoded.slice(0, index);
    const password = decoded.slice(index + 1);
    return safeEqual(user, config.apiUser) && safeEqual(password, config.apiPassword);
  }

  async function handle(req, res) {
    const url = new URL(req.url || "/", "http://localhost");
    const method = (req.method || "GET").toUpperCase();
    const segments = url.pathname.split("/").filter(Boolean);

    if (method === "GET" && url.pathname === "/health") {
      const extensions = await store.list();
      send(res, 200, { ok: true, service: "cloudtel-pbx-admin", extensions: extensions.length });
      return;
    }

    if (!authorised(req)) {
      res.setHeader("WWW-Authenticate", 'Basic realm="cloudtel-pbx"');
      throw new HttpError(401, "UNAUTHORIZED", "Authentication required.");
    }

    if (segments[0] === "extensions") {
      if (segments.length === 1 && method === "GET") {
        send(res, 200, { extensions: await store.list() });
        return;
      }
      if (segments.length === 1 && method === "POST") {
        const body = await readJson(req);
        const number = String(body.number || "");
        if (!isValidNumber(number)) {
          throw new HttpError(422, "VALIDATION_ERROR", "number must be 2-12 digits.");
        }
        const existing = await store.get(number);
        if (existing) throw new HttpError(409, "CONFLICT", `Extension ${number} already exists on the PBX.`);
        const extension = {
          number,
          displayName: sanitiseDisplayName(body.displayName),
          password: typeof body.password === "string" && body.password ? body.password : generateSipPassword(),
          enabled: body.enabled !== false,
          context: typeof body.context === "string" && body.context ? body.context : config.context,
          organisationId: body.organisationId || null,
          updatedAt: new Date().toISOString(),
        };
        await store.upsert(extension);
        try {
          await apply();
        } catch (error) {
          logger.error?.("[pbx-admin] pjsip reload failed", { message: error.message });
          throw new HttpError(502, "PBX_RELOAD_FAILED", `Extension saved but PJSIP reload failed: ${error.message}`);
        }
        send(res, 201, { endpointId: number, number, password: extension.password });
        return;
      }
      if (segments.length === 2) {
        const number = segments[1];
        if (!isValidNumber(number)) throw new HttpError(404, "NOT_FOUND", "Extension not found.");
        const existing = await store.get(number);
        if (!existing) throw new HttpError(404, "NOT_FOUND", `Extension ${number} is not provisioned.`);
        if (method === "PUT" || method === "PATCH") {
          const body = await readJson(req);
          const updated = { ...existing };
          if (body.displayName !== undefined) updated.displayName = sanitiseDisplayName(body.displayName);
          if (body.enabled !== undefined) updated.enabled = body.enabled !== false;
          if (body.context !== undefined && body.context) updated.context = body.context;
          if (typeof body.password === "string" && body.password) updated.password = body.password;
          else if (body.rotateCredentials === true) updated.password = generateSipPassword();
          updated.updatedAt = new Date().toISOString();
          await store.upsert(updated);
          try {
            await apply();
          } catch (error) {
            throw new HttpError(502, "PBX_RELOAD_FAILED", `Extension saved but PJSIP reload failed: ${error.message}`);
          }
          send(res, 200, { endpointId: number, password: updated.password });
          return;
        }
        if (method === "DELETE") {
          await store.remove(number);
          try {
            await apply();
          } catch (error) {
            throw new HttpError(502, "PBX_RELOAD_FAILED", `Extension removed but PJSIP reload failed: ${error.message}`);
          }
          send(res, 200, { deleted: true, endpointId: number });
          return;
        }
      }
    }

    if (segments[0] === "calls" && segments.length === 3 && method === "POST") {
      const id = decodeURIComponent(segments[1]);
      const action = segments[2];
      const body = method === "POST" ? await readJson(req) : {};
      switch (action) {
        case "answer":
          await ari.answer(id);
          break;
        case "hangup":
          await ari.hangup(id);
          break;
        case "hold":
          await ari.hold(id);
          break;
        case "resume":
          await ari.resume(id);
          break;
        case "mute":
          await ari.mute(id);
          break;
        case "unmute":
          await ari.unmute(id);
          break;
        case "dtmf": {
          const digits = String(body.digits || "");
          if (!/^[0-9*#A-D]{1,64}$/.test(digits)) {
            throw new HttpError(422, "VALIDATION_ERROR", "digits must contain only 0-9, *, #, A-D.");
          }
          await ari.sendDtmf(id, digits);
          break;
        }
        case "transfer": {
          const target = String(body.target || "");
          if (!isValidNumber(target)) {
            throw new HttpError(422, "VALIDATION_ERROR", "target must be a valid extension number.");
          }
          await ari.redirect(id, `PJSIP/${target}`);
          break;
        }
        default:
          throw new HttpError(404, "NOT_FOUND", `Unknown call action "${action}".`);
      }
      send(res, 200, { ok: true, callId: id, action });
      return;
    }

    throw new HttpError(404, "NOT_FOUND", "Endpoint not found.");
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (error instanceof HttpError) {
        send(res, error.status, { message: error.message, code: error.code });
        return;
      }
      logger.error?.("[pbx-admin] request failed", { message: error?.message, path: req.url });
      send(res, 502, { message: error?.message || "PBX operation failed.", code: "PBX_ERROR" });
    });
  });

  server.on("listening", () => {
    writeInclude()
      .then(() => ari.reloadPjsip())
      .then(() => logger.log?.("[pbx-admin] PJSIP include written and reloaded"))
      .catch((error) => logger.error?.("[pbx-admin] startup reload failed", { message: error.message }));
  });

  return server;
}
