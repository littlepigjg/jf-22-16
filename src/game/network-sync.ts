import type {
  Ball,
  GamePhase,
  NetworkRole,
  PartialSyncPayload,
  Player,
  Shot,
  StateSyncPayload,
  Team,
} from './types';
import { FoulType } from './types';
import { networkManager } from './network';
import { MAX_POWER } from './constants';
import { applyShot } from './physics';
import { isOnlineCoop } from './coop-helpers';
import type { PlayMode } from './types';

interface SyncStats {
  lastSyncTime: number;
  lastSyncSeq: number;
  pendingShots: Map<number, Shot>;
  droppedFrames: number;
  latency: number;
  hostFrame: number;
}

class NetworkSyncManager {
  private stats: SyncStats = {
    lastSyncTime: 0,
    lastSyncSeq: 0,
    pendingShots: new Map(),
    droppedFrames: 0,
    latency: 0,
    hostFrame: 0,
  };

  private seqCounter = 0;
  private lastFullSyncSeq = 0;
  private syncInterval: number | null = null;
  private role: NetworkRole = null;
  private playMode: PlayMode = 'pvp';

  private onFullSyncCb: ((state: StateSyncPayload) => void) | null = null;
  private onPartialSyncCb: ((state: PartialSyncPayload) => void) | null = null;
  private onShotReceivedCb: ((aimAngle: number, power: number, playerId: number) => void) | null = null;

  setRole(role: NetworkRole): void {
    this.role = role;
  }

  setPlayMode(mode: PlayMode): void {
    this.playMode = mode;
  }

  isHost(): boolean {
    return this.role === 'host';
  }

  isGuest(): boolean {
    return this.role === 'guest';
  }

  isOnlineMode(): boolean {
    return isOnlineCoop(this.playMode);
  }

  shouldRunPhysics(): boolean {
    if (!this.isOnlineMode()) return true;
    return this.isHost();
  }

  canControlPlayer(playerId: number, players: Player[]): boolean {
    if (!this.isOnlineMode()) return true;
    if (this.isHost()) {
      return playerId === 0 || players[playerId]?.isAI === true;
    }
    return playerId === 1;
  }

  onFullSync(callback: (state: StateSyncPayload) => void): void {
    this.onFullSyncCb = callback;
  }

  onPartialSync(callback: (state: PartialSyncPayload) => void): void {
    this.onPartialSyncCb = callback;
  }

  onShotReceived(callback: (aimAngle: number, power: number, playerId: number) => void): void {
    this.onShotReceivedCb = callback;
  }

  handleMessage(type: string, payload: unknown, seq?: number): void {
    switch (type) {
      case 'state-full-sync':
        this.handleFullSync(payload as StateSyncPayload);
        break;
      case 'state-partial-sync':
        this.handlePartialSync(payload as PartialSyncPayload);
        break;
      case 'shot':
        this.handleShot(payload as { aimAngle: number; power: number; playerId: number });
        break;
      case 'sync-ack':
        this.handleSyncAck(payload as { seq: number; timestamp: number });
        break;
    }
  }

  startSyncLoop(): void {
    if (this.syncInterval) return;
    this.syncInterval = window.setInterval(() => {
      if (this.isHost() && this.isOnlineMode() && networkManager.status === 'connected') {
        this.sendSyncAck();
      }
    }, 200);
  }

  stopSyncLoop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  sendFullState(
    balls: Ball[],
    players: Player[],
    teams: Team[],
    currentPlayerId: number,
    currentTeamId: number,
    phase: GamePhase,
    turnNumber: number,
    foul: FoulType,
    foulMessage: string | null,
    groupsAssigned: boolean,
    targetBallHint: string | null,
    freeBall: boolean,
  ): void {
    if (!this.isHost() || !this.isOnlineMode()) return;

    const seq = ++this.seqCounter;
    this.lastFullSyncSeq = seq;

    const payload: StateSyncPayload = {
      balls: balls.map((b) => ({
        id: b.id,
        pos: { x: b.pos.x, y: b.pos.y },
        vel: { x: b.vel.x, y: b.vel.y },
        pocketed: b.pocketed,
      })),
      players,
      teams,
      currentPlayerId,
      currentTeamId,
      phase,
      turnNumber,
      foul,
      foulMessage,
      groupsAssigned,
      targetBallHint,
      freeBall,
      seq,
      timestamp: Date.now(),
    };

    networkManager.send({
      type: 'state-full-sync',
      payload,
      seq,
    });

    this.stats.lastSyncSeq = seq;
    this.stats.lastSyncTime = Date.now();
  }

  sendPartialState(
    partial: Partial<Pick<
      PartialSyncPayload,
      | 'balls'
      | 'currentPlayerId'
      | 'currentTeamId'
      | 'phase'
      | 'turnNumber'
      | 'foul'
      | 'foulMessage'
      | 'groupsAssigned'
      | 'targetBallHint'
      | 'freeBall'
      | 'shotResult'
    >>,
  ): void {
    if (!this.isHost() || !this.isOnlineMode()) return;

    const seq = ++this.seqCounter;
    const payload: PartialSyncPayload = {
      ...partial,
      seq,
      timestamp: Date.now(),
    };

    networkManager.send({
      type: 'state-partial-sync',
      payload,
      seq,
    });
  }

  sendTurnStart(playerId: number): void {
    if (!this.isHost() || !this.isOnlineMode()) return;

    networkManager.send({
      type: 'turn-start',
      payload: { playerId, timestamp: Date.now() },
    });
  }

  sendAimUpdate(angle: number): void {
    networkManager.sendAimUpdate(angle);
  }

  sendShotInput(aimAngle: number, power: number, playerId: number): void {
    if (!this.isOnlineMode()) return;

    networkManager.send({
      type: 'shot',
      payload: { aimAngle, power, playerId },
    });
  }

  applyShotLocal(aimAngle: number, power: number, playerId: number, balls: Ball[]): Shot | null {
    const shot: Shot = {
      aimAngle,
      power,
      playerId,
      timestamp: Date.now(),
      hits: [],
      pocketedBalls: [],
      foul: FoulType.NONE,
    };

    try {
      applyShot(balls, aimAngle, power, MAX_POWER);
      return shot;
    } catch {
      return null;
    }
  }

  getStats(): SyncStats {
    return { ...this.stats };
  }

  getSeq(): number {
    return this.seqCounter;
  }

  getLatency(): number {
    return this.stats.latency;
  }

  reset(): void {
    this.seqCounter = 0;
    this.lastFullSyncSeq = 0;
    this.stats = {
      lastSyncTime: 0,
      lastSyncSeq: 0,
      pendingShots: new Map(),
      droppedFrames: 0,
      latency: 0,
      hostFrame: 0,
    };
    this.stopSyncLoop();
  }

  private handleFullSync(payload: StateSyncPayload): void {
    if (!this.isGuest()) return;

    if (payload.seq < this.stats.lastSyncSeq) {
      this.stats.droppedFrames++;
      return;
    }

    this.stats.lastSyncSeq = payload.seq;
    this.stats.lastSyncTime = Date.now();
    this.stats.hostFrame = payload.seq;
    this.stats.latency = Date.now() - payload.timestamp;

    this.onFullSyncCb?.(payload);
  }

  private handlePartialSync(payload: PartialSyncPayload): void {
    if (!this.isGuest()) return;

    if (payload.seq < this.stats.lastSyncSeq) {
      this.stats.droppedFrames++;
      return;
    }

    this.stats.lastSyncSeq = payload.seq;
    this.stats.lastSyncTime = Date.now();
    this.stats.latency = Date.now() - payload.timestamp;

    this.onPartialSyncCb?.(payload);
  }

  private handleShot(payload: { aimAngle: number; power: number; playerId: number }): void {
    if (!this.isHost()) return;

    this.onShotReceivedCb?.(payload.aimAngle, payload.power, payload.playerId);
  }

  private handleSyncAck(payload: { seq: number; timestamp: number }): void {
    this.stats.latency = Date.now() - payload.timestamp;
  }

  private sendSyncAck(): void {
    networkManager.send({
      type: 'sync-ack',
      payload: {
        seq: this.stats.lastSyncSeq,
        timestamp: Date.now(),
      },
    });
  }

  createFullStatePayload(
    balls: Ball[],
    players: Player[],
    teams: Team[],
    currentPlayerId: number,
    currentTeamId: number,
    phase: GamePhase,
    turnNumber: number,
    foul: FoulType,
    foulMessage: string | null,
    groupsAssigned: boolean,
    targetBallHint: string | null,
    freeBall: boolean,
  ): StateSyncPayload {
    return {
      balls: balls.map((b) => ({
        id: b.id,
        pos: { x: b.pos.x, y: b.pos.y },
        vel: { x: b.vel.x, y: b.vel.y },
        pocketed: b.pocketed,
      })),
      players,
      teams,
      currentPlayerId,
      currentTeamId,
      phase,
      turnNumber,
      foul,
      foulMessage,
      groupsAssigned,
      targetBallHint,
      freeBall,
      seq: this.seqCounter,
      timestamp: Date.now(),
    };
  }

  createBallDiff(oldBalls: Ball[], newBalls: Ball[]): PartialSyncPayload['balls'] {
    const changed: PartialSyncPayload['balls'] = [];
    for (const newBall of newBalls) {
      const oldBall = oldBalls.find((b) => b.id === newBall.id);
      if (!oldBall) {
        changed.push({
          id: newBall.id,
          pos: { x: newBall.pos.x, y: newBall.pos.y },
          vel: { x: newBall.vel.x, y: newBall.vel.y },
          pocketed: newBall.pocketed,
        });
        continue;
      }
      if (
        Math.abs(oldBall.pos.x - newBall.pos.x) > 0.01 ||
        Math.abs(oldBall.pos.y - newBall.pos.y) > 0.01 ||
        Math.abs(oldBall.vel.x - newBall.vel.x) > 0.01 ||
        Math.abs(oldBall.vel.y - newBall.vel.y) > 0.01 ||
        oldBall.pocketed !== newBall.pocketed
      ) {
        changed.push({
          id: newBall.id,
          pos: { x: newBall.pos.x, y: newBall.pos.y },
          vel: { x: newBall.vel.x, y: newBall.vel.y },
          pocketed: newBall.pocketed,
        });
      }
    }
    return changed.length > 0 ? changed : undefined;
  }
}

export const networkSync = new NetworkSyncManager();
export { NetworkSyncManager };
