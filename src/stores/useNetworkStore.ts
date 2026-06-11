import { create } from 'zustand';
import type { NetworkMessage, NetworkRole, NetworkStatus, PartialSyncPayload, StateSyncPayload } from '../game/types';
import { networkManager } from '../game/network';
import { networkSync } from '../game/network-sync';

interface NetworkStore {
  status: NetworkStatus;
  role: NetworkRole;
  localId: string;
  peerId: string | null;
  sessionId: string | null;
  error: string | null;
  offerCode: string | null;
  answerCode: string | null;
  isHost: boolean;
  lastMessage: NetworkMessage | null;
  connectedAt: number | null;
  latency: number;
  lastSyncSeq: number;
  lastSyncTime: number;
  droppedFrames: number;
  lastFullSyncState: StateSyncPayload | null;
  lastPartialSync: PartialSyncPayload | null;

  createRoom: () => Promise<string>;
  joinRoom: (code: string) => Promise<string>;
  acceptAnswer: (answerCode: string) => Promise<void>;
  disconnect: () => void;
  sendShot: (aimAngle: number, power: number, playerId: number) => void;
  sendStateSync: (state: Record<string, unknown>) => void;
  sendFullSync: (payload: StateSyncPayload) => void;
  sendPartialSync: (payload: PartialSyncPayload) => void;
  sendAimUpdate: (aimAngle: number) => void;
  sendChat: (text: string) => void;
  setOfferCode: (code: string | null) => void;
  setAnswerCode: (code: string | null) => void;
  applyFullSync: (payload: StateSyncPayload) => void;
  applyPartialSync: (payload: PartialSyncPayload) => void;
  getStats: () => { latency: number; droppedFrames: number; lastSyncSeq: number };
}

export const useNetworkStore = create<NetworkStore>((set, get) => {
  networkManager.onMessage((message) => {
    set({ lastMessage: message });

    if (message.type === 'state-full-sync') {
      const payload = message.payload as StateSyncPayload;
      set({
        lastFullSyncState: payload,
        lastSyncSeq: payload.seq,
        lastSyncTime: Date.now(),
        latency: Date.now() - payload.timestamp,
      });
      networkSync.handleMessage(message.type, message.payload, message.seq);
    } else if (message.type === 'state-partial-sync') {
      const payload = message.payload as PartialSyncPayload;
      set({
        lastPartialSync: payload,
        lastSyncSeq: payload.seq,
        lastSyncTime: Date.now(),
        latency: Date.now() - payload.timestamp,
      });
      networkSync.handleMessage(message.type, message.payload, message.seq);
    } else {
      networkSync.handleMessage(message.type, message.payload, message.seq);
    }
  });

  networkManager.onStatus((status, error) => {
    const nmRole = networkManager.role;
    networkSync.setRole(nmRole);

    set({
      status,
      error: error || null,
      role: nmRole,
      peerId: networkManager.peerId,
      sessionId: networkManager.sessionId,
      isHost: nmRole === 'host',
      connectedAt: status === 'connected' ? Date.now() : get().connectedAt,
    });

    if (status === 'connected' && nmRole === 'host') {
      networkSync.startSyncLoop();
    }
  });

  return {
    status: 'disconnected',
    role: null,
    localId: networkManager.localId,
    peerId: null,
    sessionId: null,
    error: null,
    offerCode: null,
    answerCode: null,
    isHost: false,
    lastMessage: null,
    connectedAt: null,
    latency: 0,
    lastSyncSeq: 0,
    lastSyncTime: 0,
    droppedFrames: 0,
    lastFullSyncState: null,
    lastPartialSync: null,

    createRoom: async () => {
      networkSync.reset();
      networkSync.setRole('host');
      set({ isHost: true, error: null, offerCode: null, answerCode: null, droppedFrames: 0, lastSyncSeq: 0 });
      const offerCode = await networkManager.createRoom();
      set({ offerCode });
      return offerCode;
    },

    joinRoom: async (code: string) => {
      networkSync.reset();
      networkSync.setRole('guest');
      set({ isHost: false, error: null, offerCode: null, answerCode: null, droppedFrames: 0, lastSyncSeq: 0 });
      const answerCode = await networkManager.joinRoom(code);
      set({ answerCode });
      return answerCode;
    },

    acceptAnswer: async (answerCode: string) => {
      await networkManager.acceptAnswer(answerCode);
      set({ answerCode });
    },

    disconnect: () => {
      networkSync.stopSyncLoop();
      networkSync.reset();
      networkManager.disconnect();
      set({
        status: 'disconnected',
        role: null,
        peerId: null,
        sessionId: null,
        error: null,
        offerCode: null,
        answerCode: null,
        isHost: false,
        lastMessage: null,
        connectedAt: null,
        latency: 0,
        lastSyncSeq: 0,
        lastSyncTime: 0,
        droppedFrames: 0,
        lastFullSyncState: null,
        lastPartialSync: null,
      });
    },

    sendShot: (aimAngle, power, playerId) => {
      networkManager.sendShot(aimAngle, power, playerId);
    },

    sendStateSync: (state) => {
      networkManager.sendStateSync(state);
    },

    sendFullSync: (payload) => {
      networkManager.sendFullSync(payload);
    },

    sendPartialSync: (payload) => {
      networkManager.sendPartialSync(payload);
    },

    sendAimUpdate: (aimAngle) => {
      networkManager.sendAimUpdate(aimAngle);
    },

    sendChat: (text) => {
      networkManager.sendChat(text);
    },

    setOfferCode: (code) => set({ offerCode: code }),
    setAnswerCode: (code) => set({ answerCode: code }),

    applyFullSync: (payload) => {
      const currentSeq = get().lastSyncSeq;
      if (payload.seq < currentSeq) {
        set((s) => ({ droppedFrames: s.droppedFrames + 1 }));
        return;
      }
      set({
        lastFullSyncState: payload,
        lastSyncSeq: payload.seq,
        lastSyncTime: Date.now(),
        latency: Date.now() - payload.timestamp,
      });
    },

    applyPartialSync: (payload) => {
      const currentSeq = get().lastSyncSeq;
      if (payload.seq < currentSeq) {
        set((s) => ({ droppedFrames: s.droppedFrames + 1 }));
        return;
      }
      set({
        lastPartialSync: payload,
        lastSyncSeq: payload.seq,
        lastSyncTime: Date.now(),
        latency: Date.now() - payload.timestamp,
      });
    },

    getStats: () => {
      const s = get();
      return {
        latency: s.latency,
        droppedFrames: s.droppedFrames,
        lastSyncSeq: s.lastSyncSeq,
      };
    },
  };
});
