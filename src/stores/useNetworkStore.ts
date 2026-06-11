import { create } from 'zustand';
import type { NetworkMessage, NetworkRole, NetworkStatus } from '../game/types';
import { networkManager } from '../game/network';

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

  createRoom: () => Promise<string>;
  joinRoom: (code: string) => Promise<string>;
  acceptAnswer: (answerCode: string) => Promise<void>;
  disconnect: () => void;
  sendShot: (aimAngle: number, power: number, playerId: number) => void;
  sendStateSync: (state: Record<string, unknown>) => void;
  sendAimUpdate: (aimAngle: number) => void;
  sendChat: (text: string) => void;
  setOfferCode: (code: string | null) => void;
  setAnswerCode: (code: string | null) => void;
}

export const useNetworkStore = create<NetworkStore>((set, get) => {
  networkManager.onMessage((message) => {
    set({ lastMessage: message });
  });

  networkManager.onStatus((status, error) => {
    set({
      status,
      error: error || null,
      role: networkManager.role,
      peerId: networkManager.peerId,
      sessionId: networkManager.sessionId,
      connectedAt: status === 'connected' ? Date.now() : get().connectedAt,
    });
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

    createRoom: async () => {
      set({ isHost: true, error: null, offerCode: null, answerCode: null });
      const offerCode = await networkManager.createRoom();
      set({ offerCode });
      return offerCode;
    },

    joinRoom: async (code: string) => {
      set({ isHost: false, error: null, offerCode: null, answerCode: null });
      const answerCode = await networkManager.joinRoom(code);
      set({ answerCode });
      return answerCode;
    },

    acceptAnswer: async (answerCode: string) => {
      await networkManager.acceptAnswer(answerCode);
      set({ answerCode });
    },

    disconnect: () => {
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
      });
    },

    sendShot: (aimAngle, power, playerId) => {
      networkManager.sendShot(aimAngle, power, playerId);
    },

    sendStateSync: (state) => {
      networkManager.sendStateSync(state);
    },

    sendAimUpdate: (aimAngle) => {
      networkManager.sendAimUpdate(aimAngle);
    },

    sendChat: (text) => {
      networkManager.sendChat(text);
    },

    setOfferCode: (code) => set({ offerCode: code }),
    setAnswerCode: (code) => set({ answerCode: code }),
  };
});
