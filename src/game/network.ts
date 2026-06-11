import type { NetworkMessage, NetworkMessageType, NetworkRole, NetworkStatus, PartialSyncPayload, StateSyncPayload } from './types';

type MessageHandler = (message: NetworkMessage) => void;
type StatusHandler = (status: NetworkStatus, error?: string) => void;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const DATA_CHANNEL_LABEL = 'billiards-coop';

class NetworkManager {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private _role: NetworkRole = null;
  private _status: NetworkStatus = 'disconnected';
  private _localId: string;
  private _peerId: string | null = null;
  private _sessionId: string | null = null;
  private onMessageCb: MessageHandler | null = null;
  private onStatusCb: StatusHandler | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor() {
    this._localId = generateId();
  }

  get role(): NetworkRole {
    return this._role;
  }

  get status(): NetworkStatus {
    return this._status;
  }

  get localId(): string {
    return this._localId;
  }

  get peerId(): string | null {
    return this._peerId;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  onMessage(handler: MessageHandler): void {
    this.onMessageCb = handler;
  }

  onStatus(handler: StatusHandler): void {
    this.onStatusCb = handler;
  }

  private setStatus(status: NetworkStatus, error?: string): void {
    this._status = status;
    this.onStatusCb?.(status, error);
  }

  async createRoom(): Promise<string> {
    this.cleanup();
    this._role = 'host';
    this._sessionId = generateId();
    this.setStatus('connecting');

    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.dc = this.pc.createDataChannel(DATA_CHANNEL_LABEL, {
      ordered: true,
    });
    this.setupDataChannel(this.dc);

    this.pc.onicecandidate = (e) => {
      if (!e.candidate) {
        this.pendingCandidates = [];
      }
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    await this.waitForIceGathering();

    const encoded = encodeSDP(this.pc.localDescription!, this._sessionId);
    return encoded;
  }

  async joinRoom(code: string): Promise<string> {
    this.cleanup();
    this._role = 'guest';
    this.setStatus('connecting');

    const { sdp: offerSdp, sessionId } = decodeSDP(code);
    this._sessionId = sessionId;

    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.pc.ondatachannel = (e) => {
      this.dc = e.channel;
      this.setupDataChannel(this.dc);
    };

    this.pc.onicecandidate = () => {};

    await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp));

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    await this.waitForIceGathering();

    const encoded = encodeSDP(this.pc.localDescription!, this._sessionId);
    return encoded;
  }

  async acceptAnswer(answerCode: string): Promise<void> {
    if (!this.pc || this._role !== 'host') return;

    const { sdp: answerSdp } = decodeSDP(answerCode);
    await this.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
  }

  send(message: Omit<NetworkMessage, 'timestamp' | 'senderId'>): void {
    if (!this.dc || this.dc.readyState !== 'open') return;

    const fullMessage: NetworkMessage = {
      ...message,
      timestamp: Date.now(),
      senderId: this._localId,
    };

    try {
      this.dc.send(JSON.stringify(fullMessage));
    } catch {
      console.warn('Failed to send network message');
    }
  }

  sendShot(aimAngle: number, power: number, playerId: number): void {
    this.send({
      type: 'shot',
      payload: { aimAngle, power, playerId },
    });
  }

  sendStateSync(state: Record<string, unknown>): void {
    this.send({
      type: 'state-sync',
      payload: state,
    });
  }

  sendReady(): void {
    this.send({
      type: 'player-ready',
      payload: { id: this._localId },
    });
  }

  sendAimUpdate(aimAngle: number): void {
    this.send({
      type: 'aim-update',
      payload: { aimAngle },
    });
  }

  sendChat(text: string): void {
    this.send({
      type: 'chat',
      payload: { text },
    });
  }

  sendFullSync(payload: StateSyncPayload): void {
    this.send({
      type: 'state-full-sync',
      payload,
      seq: payload.seq,
    });
  }

  sendPartialSync(payload: PartialSyncPayload): void {
    this.send({
      type: 'state-partial-sync',
      payload,
      seq: payload.seq,
    });
  }

  sendTurnStart(playerId: number): void {
    this.send({
      type: 'turn-start',
      payload: { playerId, timestamp: Date.now() },
    });
  }

  sendSyncAck(seq: number): void {
    this.send({
      type: 'sync-ack',
      payload: { seq, timestamp: Date.now() },
    });
  }

  disconnect(): void {
    this.cleanup();
    this._role = null;
    this._peerId = null;
    this._sessionId = null;
    this.setStatus('disconnected');
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    dc.onopen = () => {
      this._peerId = 'peer';
      this.setStatus('connected');
      this.sendReady();
    };

    dc.onclose = () => {
      this.setStatus('disconnected');
    };

    dc.onerror = () => {
      this.setStatus('error', 'Data channel error');
    };

    dc.onmessage = (e) => {
      try {
        const message: NetworkMessage = JSON.parse(e.data);
        this.onMessageCb?.(message);
      } catch {
        console.warn('Failed to parse network message');
      }
    };
  }

  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc) {
        resolve();
        return;
      }

      if (this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      this.pc.addEventListener('icegatheringstatechange', checkState);

      setTimeout(() => {
        this.pc?.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, 5000);
    });
  }

  private cleanup(): void {
    if (this.dc) {
      this.dc.onopen = null;
      this.dc.onclose = null;
      this.dc.onerror = null;
      this.dc.onmessage = null;
      this.dc.close();
      this.dc = null;
    }

    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ondatachannel = null;
      this.pc.close();
      this.pc = null;
    }
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function encodeSDP(sdp: RTCSessionDescription, sessionId: string): string {
  const data = {
    type: sdp.type,
    sdp: sdp.sdp,
    sid: sessionId,
  };
  const json = JSON.stringify(data);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeSDP(encoded: string): { sdp: RTCSessionDescriptionInit; sessionId: string } {
  const json = decodeURIComponent(escape(atob(encoded.trim())));
  const data = JSON.parse(json);
  return {
    sdp: { type: data.type, sdp: data.sdp },
    sessionId: data.sid || '',
  };
}

export const networkManager = new NetworkManager();
export { NetworkManager };
