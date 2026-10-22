/**
 * Internal call routing for the CloudTel Stasis application.
 *
 * The dialplan hands internal calls to Stasis:
 *   exten => _1XXX,1,Stasis(cloudtel,internal,${EXTEN})
 *
 * The bridge answers none of the SIP signalling itself; it asks Asterisk to
 * originate the callee endpoint and mixes the two channels in a bridge once the
 * callee answers. This keeps call control in one place (ARI) and lets the
 * event bridge emit accurate lifecycle webhooks.
 *
 * Outbound trunk calls (9...) and voicemail deposits are intentionally left to
 * the dialplan / future trunk configuration.
 */
const EXTENSION_RE = /^[0-9]{2,12}$/;

export function attachCallRouting(client, { stasisApp = "cloudtel", logger = console } = {}) {
  const pending = new Map(); // callerChannelId -> { target, bridge }
  const calleeToCaller = new Map(); // calleeChannelId -> callerChannelId

  async function safe(label, promise) {
    try {
      return await promise;
    } catch (error) {
      logger.error?.(`[ari-bridge] routing ${label} failed: ${error.message}`);
      return null;
    }
  }

  function hangup(channelId) {
    return safe("hangup", client.channels.hangup({ channelId }));
  }

  async function cleanup(callerId) {
    const pair = pending.get(callerId);
    if (!pair) return;
    pending.delete(callerId);
    if (pair.calleeId) calleeToCaller.delete(pair.calleeId);
    await safe("bridge delete", pair.bridge.delete());
  }

  client.on("StasisStart", async (event, channel) => {
    const args = event.args || [];
    if (args[0] === "internal") {
      const target = args[1] || "";
      if (!EXTENSION_RE.test(target)) {
        logger.warn?.(`[ari-bridge] rejecting internal call to invalid extension "${target}"`);
        await hangup(channel.id);
        return;
      }
      const bridge = await safe("bridge create", client.bridges.create({ type: "mixing" }));
      if (!bridge) {
        await hangup(channel.id);
        return;
      }
      pending.set(channel.id, { target, bridge, calleeId: null });
      // Send a ringing indication so the browser plays local ringback while the
      // callee endpoint is being originated.
      await safe("ring caller", client.channels.ring({ channelId: channel.id }));
      await safe(
        "originate callee",
        client.channels.originate({
          endpoint: `PJSIP/${target}`,
          app: stasisApp,
          appArgs: `internal-callee,${channel.id}`,
          callerId: channel.caller?.number
            ? `"${String(channel.caller.name || "").replace(/"/g, "")}" <${channel.caller.number}>`
            : undefined,
          timeout: 30,
        })
      );
      return;
    }

    if (args[0] === "internal-callee") {
      const callerId = args[1];
      const pair = pending.get(callerId);
      if (!pair) {
        logger.warn?.("[ari-bridge] callee arrived for an unknown caller");
        await hangup(channel.id);
        return;
      }
      pair.calleeId = channel.id;
      calleeToCaller.set(channel.id, callerId);
    }
  });

  client.on("ChannelStateChange", async (event, channel) => {
    if (channel?.state !== "Up") return;
    const callerId = calleeToCaller.get(channel.id);
    if (!callerId) return;
    const pair = pending.get(callerId);
    if (!pair) return;
    await safe("ring stop", client.channels.ringStop({ channelId: callerId }));
    await safe("answer caller", client.channels.answer({ channelId: callerId }));
    await safe("add caller to bridge", pair.bridge.addChannel({ channel: callerId }));
    await safe("add callee to bridge", pair.bridge.addChannel({ channel: channel.id }));
    logger.log?.(`[ari-bridge] bridging ${callerId} <-> ${channel.id}`);
  });

  client.on("ChannelDestroyed", async (event, channel) => {
    const id = channel?.id;
    if (!id) return;
    if (pending.has(id)) {
      const pair = pending.get(id);
      pending.delete(id);
      if (pair.calleeId) {
        calleeToCaller.delete(pair.calleeId);
        await hangup(pair.calleeId);
      }
      await safe("bridge delete", pair.bridge.delete());
      return;
    }
    const callerId = calleeToCaller.get(id);
    if (callerId) {
      calleeToCaller.delete(id);
      const pair = pending.get(callerId);
      if (pair) {
        pair.calleeId = null;
        await hangup(callerId);
      }
      return;
    }
  });

  return {
    pending,
    stop() {
      pending.clear();
      calleeToCaller.clear();
      for (const name of ["StasisStart", "ChannelStateChange", "ChannelDestroyed"]) {
        client.removeAllListeners?.(name);
      }
    },
  };
}
