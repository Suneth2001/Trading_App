const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeRemainingLength(len) {
  const out = [];
  do {
    let b = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) b |= 128;
    out.push(b);
  } while (len > 0);
  return out;
}

function encodeUtf8Field(str) {
  const bytes = encoder.encode(str);
  return [(bytes.length >> 8) & 0xff, bytes.length & 0xff, ...bytes];
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/**
 * Browser/Mobile pure-JS MQTT v3.1.1 over WebSocket client with multi-broker failover.
 */
export class MqttRelayClient {
  constructor({
    clientId,
    topics = [],
    brokers = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'],
    onMessage = null
  }) {
    this.clientId = clientId || `mob_${Math.random().toString(36).slice(2, 10)}`;
    this.topics = topics;
    this.brokers = brokers;
    this.brokerIndex = 0;
    this.onMessage = onMessage;
    this.ws = null;
    this.connected = false;
    this.closed = false;
    this.packetId = 1;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.pendingPublishes = new Map();
  }

  _pktConnect() {
    const vh = new Uint8Array([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x2d]);
    const pl = new Uint8Array(encodeUtf8Field(this.clientId));
    const rem = new Uint8Array(encodeRemainingLength(vh.length + pl.length));
    return concatBytes(new Uint8Array([0x10]), rem, vh, pl);
  }

  _pktSubscribe(topics) {
    const pid = this.packetId++;
    if (this.packetId > 65000) this.packetId = 1;
    const vh = new Uint8Array([(pid >> 8) & 0xff, pid & 0xff]);
    const parts = [];
    for (const t of topics) {
      parts.push(...encodeUtf8Field(t), 0x00);
    }
    const pl = new Uint8Array(parts);
    const rem = new Uint8Array(encodeRemainingLength(vh.length + pl.length));
    return concatBytes(new Uint8Array([0x82]), rem, vh, pl);
  }

  _pktPublish(topic, payloadStr, retain = true) {
    const vh = new Uint8Array(encodeUtf8Field(topic));
    const pl = encoder.encode(payloadStr);
    const rem = new Uint8Array(encodeRemainingLength(vh.length + pl.length));
    return concatBytes(new Uint8Array([retain ? 0x31 : 0x30]), rem, vh, pl);
  }

  _decodePackets(buf) {
    const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let offset = 0;
    while (offset < data.length) {
      const header = data[offset++];
      const type = header >> 4;
      const qos = (header >> 1) & 0x03;

      let multiplier = 1;
      let remLen = 0;
      let encodedByte;
      do {
        if (offset >= data.length) return;
        encodedByte = data[offset++];
        remLen += (encodedByte & 127) * multiplier;
        multiplier *= 128;
      } while ((encodedByte & 128) !== 0);

      const frameEnd = offset + remLen;
      if (frameEnd > data.length) return;

      if (type === 2) {
        this.connected = true;
        if (this.topics.length > 0 && this.ws?.readyState === 1) {
          this.ws.send(this._pktSubscribe(this.topics));
        }
        this._flushPending();
      } else if (type === 3) {
        let pos = offset;
        if (pos + 2 <= frameEnd) {
          const tLen = (data[pos] << 8) | data[pos + 1];
          pos += 2;
          const topic = decoder.decode(data.subarray(pos, pos + tLen));
          pos += tLen;
          if (qos > 0) pos += 2;
          const payload = decoder.decode(data.subarray(pos, frameEnd));
          if (this.onMessage) {
            try { this.onMessage(topic, payload); } catch {}
          }
        }
      }

      offset = frameEnd;
    }
  }

  _flushPending() {
    if (!this.connected || this.ws?.readyState !== 1) return;
    for (const [topic, entry] of this.pendingPublishes.entries()) {
      try {
        this.ws.send(this._pktPublish(topic, entry.payload, entry.retain));
      } catch {}
    }
    this.pendingPublishes.clear();
  }

  ensureConnected() {
    if (this.closed) this.closed = false;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.connect();
  }

  connect() {
    this.closed = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;

    const url = this.brokers[this.brokerIndex % this.brokers.length];
    try {
      const ws = new WebSocket(url, 'mqtt');
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let hadConn = false;

      ws.onopen = () => {
        try { ws.send(this._pktConnect()); } catch {}
        this.pingTimer = setInterval(() => {
          if (this.connected && this.ws?.readyState === 1) {
            try { this.ws.send(new Uint8Array([0xc0, 0x00])); } catch {}
          }
        }, 25000);
      };

      ws.onmessage = async (event) => {
        hadConn = true;
        try {
          if (event.data instanceof ArrayBuffer) {
            this._decodePackets(new Uint8Array(event.data));
          } else if (event.data instanceof Blob) {
            const arr = await event.data.arrayBuffer();
            this._decodePackets(new Uint8Array(arr));
          }
        } catch {}
      };

      const scheduleReconnect = () => {
        this.connected = false;
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
        this.ws = null;
        if (this.closed) return;
        if (!hadConn) this.brokerIndex = (this.brokerIndex + 1) % this.brokers.length;
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };

      ws.onclose = scheduleReconnect;
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    } catch {
      this.brokerIndex = (this.brokerIndex + 1) % this.brokers.length;
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    }
  }

  publish(topic, objOrStr, retain = true) {
    const payload = typeof objOrStr === 'string' ? objOrStr : JSON.stringify(objOrStr);
    if (this.connected && this.ws?.readyState === 1) {
      try {
        this.ws.send(this._pktPublish(topic, payload, retain));
        return true;
      } catch {}
    }
    this.pendingPublishes.set(topic, { payload, retain });
    return false;
  }

  close() {
    this.closed = true;
    this.connected = false;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }
}
