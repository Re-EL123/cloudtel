/**
 * The only module that imports SIP.js. Everything else uses the call manager.
 * SIP.js is loaded lazily from a CDN/served bundle so the static app has no
 * build step; `connect()` fails gracefully when the library is unavailable.
 */
import { REGISTRATION_STATES, SIP_DEFAULTS } from "../shared/index.js";
import { emit } from "../core/event-bus.js";

const SIP_CDN = "/vendor/sip.min.js";
const SIP_FALLBACK_CDN = "https://cdn.jsdelivr.net/npm/sip.js@0.21.2/dist/sip.min.js";

let SIP = null;
let simpleUser = null;
let registerer = null;
let registrationState = REGISTRATION_STATES.UNREGISTERED;
let lastError = null;
let videoElementFactory = null;

/** Load the SIP.js UMD bundle once. */
async function loadSipLibrary() {
  if (SIP) return SIP;
  const sources = [SIP_CDN, SIP_FALLBACK_CDN];
  for (const src of sources) {
    try {
      await new Promise((resolve, reject) => {
        if (document.querySelector(`script[data-sip="${src}"]`)) return resolve();
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.sip = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.append(script);
      });
      if (window.SIP) {
        SIP = window.SIP;
        return SIP;
      }
    } catch {
      /* try the next source */
    }
  }
  throw new Error("SIP.js could not be loaded. WebRTC calling is unavailable.");
}

export function getRegistrationState() {
  return registrationState;
}

export function getRegistrationError() {
  return lastError;
}

export function isRegistered() {
  return registrationState === REGISTRATION_STATES.REGISTERED;
}

function setRegistrationState(next, error = null) {
  registrationState = next;
  lastError = error;
  emit("sip:registration", { state: next, error });
}

/** Provide a factory the manager uses to attach remote audio. */
export function setRemoteVideoElementFactory(factory) {
  videoElementFactory = factory;
}

function mapSipRegistrationState(state) {
  switch (state) {
    case "Registered":
      return REGISTRATION_STATES.REGISTERED;
    case "Unregistered":
      return REGISTRATION_STATES.UNREGISTERED;
    case "Terminated":
      return REGISTRATION_STATES.DISCONNECTED;
    case "Registering":
      return REGISTRATION_STATES.REGISTERING;
    default:
      return REGISTRATION_STATES.UNREGISTERED;
  }
}

/**
 * Connect and register the softphone.
 * @param {{uri:string, password:string, displayName?:string, transport?:string, iceServers?:Array}} config
 */
export async function connect(config) {
  const { uri, password, displayName = "", transport = SIP_DEFAULTS.TRANSPORT, iceServers = [] } = config;
  const lib = await loadSipLibrary();

  setRegistrationState(REGISTRATION_STATES.CONNECTING);
  const transportOptions = { server: uri.replace(/^.*?@/, "wss://").replace(";transport=ws", "") };
  // The proxy is the WebSocket host; the registrar URI comes from config.uri.
  const wsUrl = config.wsUrl || transportOptions.server;

  try {
    const userAgentOptions = {
      uri: lib.UserAgent.makeURI(uri),
      transportOptions: { server: wsUrl },
      displayName: displayName || undefined,
      authorizationUsername: uri.match(/^(?:sips?:)?([^@]+)@/)?.[1],
      authorizationPassword: password,
      sessionDescriptionHandlerFactoryOptions: {
        iceGatheringTimeout: 3000,
        peerConnectionConfiguration: { iceServers },
      },
      logBuiltinEnabled: false,
    };

    simpleUser = new lib.SimpleUser(wsUrl, {
      aor: uri,
      userAgentOptions,
      media: { constraints: { audio: true, video: false }, remote: { audio: videoElementFactory ? videoElementFactory() : document.createElement("audio") } },
    });

    simpleUser.delegate = {
      onRegistered: () => setRegistrationState(REGISTRATION_STATES.REGISTERED),
      onUnregistered: () => setRegistrationState(REGISTRATION_STATES.UNREGISTERED),
      onServerDisconnect: () => setRegistrationState(REGISTRATION_STATES.RECONNECTING),
      onDisconnected: () => setRegistrationState(REGISTRATION_STATES.DISCONNECTED),
      onInvite: (invitation) => emit("sip:invite", { invitation }),
      onCallAnswered: (session) => emit("sip:answered", { session }),
      onCallHangup: (session) => emit("sip:hangup", { session }),
      onCallHold: (session, held) => emit("sip:hold", { session, held }),
    };

    await simpleUser.connect();
    setRegistrationState(REGISTRATION_STATES.REGISTERING);
    await simpleUser.register();
    return true;
  } catch (error) {
    setRegistrationState(REGISTRATION_STATES.REGISTRATION_ERROR, error?.message || "Registration failed");
    throw error;
  }
}

export async function disconnect() {
  try {
    if (simpleUser) {
      await simpleUser.unregister();
      await simpleUser.disconnect();
    }
  } catch {
    /* ignore teardown errors */
  } finally {
    simpleUser = null;
    registerer = null;
    setRegistrationState(REGISTRATION_STATES.UNREGISTERED);
  }
}

/** Place an outbound call. Returns the underlying session. */
export async function call(target) {
  if (!simpleUser) throw new Error("The softphone is not registered.");
  const session = await simpleUser.call(target);
  return session;
}

export function getUser() {
  return simpleUser;
}

export function getSipLibrary() {
  return SIP;
}

export const SIP_REGISTRATION_STATES = REGISTRATION_STATES;
