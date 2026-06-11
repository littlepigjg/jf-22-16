import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetworkSyncManager } from '../src/game/network-sync';
import type { Ball, Player, Team, GamePhase, StateSyncPayload, PartialSyncPayload } from '../src/game/types';
import { FoulType } from '../src/game/types';
import { BALL_COLORS, BALL_RADIUS } from '../src/game/constants';

function makeBall(id: number, pos = { x: 0, y: 0 }, pocketed = false): Ball {
  const conf = BALL_COLORS[id] || { color: '#ffffff', stripe: false };
  return {
    id,
    number: id,
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    acc: { x: 0, y: 0 },
    spin: { x: 0, y: 0 },
    color: conf.color,
    stripe: conf.stripe,
    radius: BALL_RADIUS,
    pocketed,
    pocketedAt: pocketed ? Date.now() : undefined,
  };
}

function makePlayers(): Player[] {
  return [
    { id: 0, name: '玩家1', isAI: false, score: 0, group: null, teamId: 0 },
    { id: 1, name: '玩家2', isAI: false, score: 0, group: null, teamId: 0 },
    { id: 2, name: 'AI', isAI: true, score: 0, group: null, teamId: 1 },
  ];
}

function makeTeams(): Team[] {
  return [
    { id: 0, name: '人类队伍', playerIds: [0, 1], score: 0, group: null },
    { id: 1, name: 'AI队伍', playerIds: [2], score: 0, group: null },
  ];
}

vi.mock('../src/game/network', () => ({
  networkManager: {
    status: 'disconnected',
    send: vi.fn(),
    sendShot: vi.fn(),
    sendAimUpdate: vi.fn(),
    sendFullSync: vi.fn(),
    sendPartialSync: vi.fn(),
    onMessage: vi.fn(),
    onStatus: vi.fn(),
  },
}));

describe('NetworkSyncManager - 权威主机模式', () => {
  let syncManager: NetworkSyncManager;

  beforeEach(() => {
    syncManager = new NetworkSyncManager();
    syncManager.reset();
  });

  describe('角色和模式判断', () => {
    it('本地模式下 shouldRunPhysics 返回 true', () => {
      syncManager.setPlayMode('pvp');
      expect(syncManager.shouldRunPhysics()).toBe(true);
    });

    it('在线模式下主机 shouldRunPhysics 返回 true', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('host');
      expect(syncManager.shouldRunPhysics()).toBe(true);
    });

    it('在线模式下客机 shouldRunPhysics 返回 false', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('guest');
      expect(syncManager.shouldRunPhysics()).toBe(false);
    });

    it('isOnlineMode 正确识别在线合作模式', () => {
      syncManager.setPlayMode('coop-online');
      expect(syncManager.isOnlineMode()).toBe(true);

      syncManager.setPlayMode('coop');
      expect(syncManager.isOnlineMode()).toBe(false);

      syncManager.setPlayMode('pvp');
      expect(syncManager.isOnlineMode()).toBe(false);
    });
  });

  describe('权限控制 - canControlPlayer', () => {
    it('本地模式下所有玩家都可以控制', () => {
      syncManager.setPlayMode('pvp');
      const players = makePlayers();

      expect(syncManager.canControlPlayer(0, players)).toBe(true);
      expect(syncManager.canControlPlayer(1, players)).toBe(true);
      expect(syncManager.canControlPlayer(2, players)).toBe(true);
    });

    it('在线模式主机可以控制玩家0和AI', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('host');
      const players = makePlayers();

      expect(syncManager.canControlPlayer(0, players)).toBe(true);
      expect(syncManager.canControlPlayer(2, players)).toBe(true);
    });

    it('在线模式主机不可以控制玩家1（客机玩家）', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('host');
      const players = makePlayers();

      expect(syncManager.canControlPlayer(1, players)).toBe(false);
    });

    it('在线模式客机只能控制玩家1', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('guest');
      const players = makePlayers();

      expect(syncManager.canControlPlayer(1, players)).toBe(true);
      expect(syncManager.canControlPlayer(0, players)).toBe(false);
      expect(syncManager.canControlPlayer(2, players)).toBe(false);
    });
  });

  describe('消息处理 - 乱序检测', () => {
    it('客机收到序列号更小的 full-sync 消息会丢弃并计数丢帧', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('guest');

      const callback = vi.fn();
      syncManager.onFullSync(callback);

      const payload1: StateSyncPayload = {
        balls: [],
        players: [],
        teams: [],
        currentPlayerId: 0,
        currentTeamId: 0,
        phase: 'aiming' as GamePhase,
        turnNumber: 1,
        foul: FoulType.NONE,
        foulMessage: null,
        groupsAssigned: false,
        targetBallHint: null,
        freeBall: false,
        seq: 10,
        timestamp: Date.now(),
      };

      syncManager.handleMessage('state-full-sync', payload1, 10);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(syncManager.getStats().droppedFrames).toBe(0);

      const payload2: StateSyncPayload = {
        ...payload1,
        seq: 5,
      };
      syncManager.handleMessage('state-full-sync', payload2, 5);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(syncManager.getStats().droppedFrames).toBe(1);
    });

    it('客机收到序列号更小的 partial-sync 消息会丢弃并计数丢帧', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('guest');

      const callback = vi.fn();
      syncManager.onPartialSync(callback);

      const payload1: PartialSyncPayload = {
        seq: 10,
        timestamp: Date.now(),
      };

      syncManager.handleMessage('state-partial-sync', payload1, 10);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(syncManager.getStats().droppedFrames).toBe(0);

      const payload2: PartialSyncPayload = {
        ...payload1,
        seq: 5,
      };
      syncManager.handleMessage('state-partial-sync', payload2, 5);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(syncManager.getStats().droppedFrames).toBe(1);
    });

    it('主机收到 shot 消息会触发 onShotReceived 回调', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('host');

      const callback = vi.fn();
      syncManager.onShotReceived(callback);

      const shotPayload = { aimAngle: 0.5, power: 0.8, playerId: 1 };
      syncManager.handleMessage('shot', shotPayload, 1);

      expect(callback).toHaveBeenCalledWith(0.5, 0.8, 1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('客机收到 shot 消息不会触发回调', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('guest');

      const callback = vi.fn();
      syncManager.onShotReceived(callback);

      const shotPayload = { aimAngle: 0.5, power: 0.8, playerId: 1 };
      syncManager.handleMessage('shot', shotPayload, 1);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('球状态差异计算 - createBallDiff', () => {
    it('球位置变化超过阈值时被检测到', () => {
      const oldBalls = [makeBall(1, { x: 100, y: 100 })];
      const newBalls = [makeBall(1, { x: 100.02, y: 100 })];

      const diff = syncManager.createBallDiff(oldBalls, newBalls);
      expect(diff).toBeDefined();
      expect(diff?.length).toBe(1);
      expect(diff?.[0].id).toBe(1);
    });

    it('球位置变化小于阈值时不被检测到', () => {
      const oldBalls = [makeBall(1, { x: 100, y: 100 })];
      const newBalls = [makeBall(1, { x: 100.001, y: 100 })];

      const diff = syncManager.createBallDiff(oldBalls, newBalls);
      expect(diff).toBeUndefined();
    });

    it('球进袋状态变化被检测到', () => {
      const oldBalls = [makeBall(1, { x: 100, y: 100 }, false)];
      const newBalls = [makeBall(1, { x: 100, y: 100 }, true)];

      const diff = syncManager.createBallDiff(oldBalls, newBalls);
      expect(diff).toBeDefined();
      expect(diff?.[0].pocketed).toBe(true);
    });

    it('多颗球变化时只返回变化的球', () => {
      const oldBalls = [
        makeBall(1, { x: 100, y: 100 }),
        makeBall(2, { x: 200, y: 200 }),
        makeBall(3, { x: 300, y: 300 }),
      ];
      const newBalls = [
        makeBall(1, { x: 100, y: 100 }),
        makeBall(2, { x: 250, y: 200 }),
        makeBall(3, { x: 300, y: 300 }, true),
      ];

      const diff = syncManager.createBallDiff(oldBalls, newBalls);
      expect(diff).toBeDefined();
      expect(diff?.length).toBe(2);
      expect(diff?.map(b => b.id).sort()).toEqual([2, 3]);
    });

    it('没有球变化时返回 undefined', () => {
      const oldBalls = [
        makeBall(1, { x: 100, y: 100 }),
        makeBall(2, { x: 200, y: 200 }),
      ];
      const newBalls = [
        makeBall(1, { x: 100, y: 100 }),
        makeBall(2, { x: 200, y: 200 }),
      ];

      const diff = syncManager.createBallDiff(oldBalls, newBalls);
      expect(diff).toBeUndefined();
    });
  });

  describe('完整状态创建 - createFullStatePayload', () => {
    it('正确创建完整状态同步 payload', () => {
      const balls = [makeBall(0), makeBall(1), makeBall(2)];
      const players = makePlayers();
      const teams = makeTeams();

      const payload = syncManager.createFullStatePayload(
        balls,
        players,
        teams,
        0,
        0,
        'aiming',
        1,
        FoulType.NONE,
        null,
        false,
        null,
        false,
      );

      expect(payload.balls.length).toBe(3);
      expect(payload.players.length).toBe(3);
      expect(payload.teams.length).toBe(2);
      expect(payload.currentPlayerId).toBe(0);
      expect(payload.phase).toBe('aiming');
      expect(payload.turnNumber).toBe(1);
      expect(payload.foul).toBe(FoulType.NONE);
    });
  });

  describe('reset 方法', () => {
    it('重置所有状态', () => {
      syncManager.setRole('host');
      syncManager.setPlayMode('coop-online');

      const callback = vi.fn();
      syncManager.onFullSync(callback);

      const payload: StateSyncPayload = {
        balls: [],
        players: [],
        teams: [],
        currentPlayerId: 0,
        currentTeamId: 0,
        phase: 'aiming' as GamePhase,
        turnNumber: 1,
        foul: FoulType.NONE,
        foulMessage: null,
        groupsAssigned: false,
        targetBallHint: null,
        freeBall: false,
        seq: 10,
        timestamp: Date.now(),
      };
      syncManager.handleMessage('state-full-sync', payload, 10);

      syncManager.reset();

      expect(syncManager.getSeq()).toBe(0);
      expect(syncManager.getStats().lastSyncSeq).toBe(0);
      expect(syncManager.getStats().droppedFrames).toBe(0);
    });
  });
});
