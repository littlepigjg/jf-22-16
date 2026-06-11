import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetworkSyncManager } from '../src/game/network-sync';
import { networkManager } from '../src/game/network';
import type { Ball, Player, Team } from '../src/game/types';
import { FoulType } from '../src/game/types';
import { BALL_COLORS, BALL_RADIUS } from '../src/game/constants';

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

const mockNetworkManager = vi.mocked(networkManager);

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

function makeCoopPlayers(): Player[] {
  return [
    { id: 0, name: '玩家1', isAI: false, score: 0, group: null, teamId: 0 },
    { id: 1, name: '玩家2', isAI: false, score: 0, group: null, teamId: 0 },
    { id: 2, name: 'AI', isAI: true, score: 0, group: null, teamId: 1 },
  ];
}

function makeCoopTeams(): Team[] {
  return [
    { id: 0, name: '人类合作队', playerIds: [0, 1], score: 0, group: null },
    { id: 1, name: 'AI队', playerIds: [2], score: 0, group: null },
  ];
}

describe('远程击球处理 - 核心修复', () => {
  let syncManager: NetworkSyncManager;

  beforeEach(() => {
    syncManager = new NetworkSyncManager();
    syncManager.reset();
    vi.clearAllMocks();
  });

  describe('消息路由 - shot消息处理', () => {
    it('主机收到客机击球消息，触发 onShotReceived 回调', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('host');

      const callback = vi.fn();
      syncManager.onShotReceived(callback);

      const shotPayload = { aimAngle: 0.5, power: 0.8, playerId: 1 };
      syncManager.handleMessage('shot', shotPayload, 1);

      expect(callback).toHaveBeenCalledWith(0.5, 0.8, 1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('客机收到击球消息，不会触发回调（只有主机处理）', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('guest');

      const callback = vi.fn();
      syncManager.onShotReceived(callback);

      const shotPayload = { aimAngle: 0.5, power: 0.8, playerId: 1 };
      syncManager.handleMessage('shot', shotPayload, 1);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('网络延迟场景 - 核心Bug修复验证', () => {
    it('即使玩家ID不是"当前玩家"，主机也会处理击球消息', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('host');

      const callback = vi.fn();
      syncManager.onShotReceived(callback);

      const shotPayload = { aimAngle: 0.3, power: 0.6, playerId: 1 };
      syncManager.handleMessage('shot', shotPayload, 5);

      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(0.3, 0.6, 1);
    });

    it('连续收到多条击球消息，都会被处理（不丢包）', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('host');

      const callback = vi.fn();
      syncManager.onShotReceived(callback);

      for (let i = 0; i < 5; i++) {
        const shotPayload = { aimAngle: i * 0.1, power: 0.5 + i * 0.1, playerId: i % 2 };
        syncManager.handleMessage('shot', shotPayload, i);
      }

      expect(callback).toHaveBeenCalledTimes(5);
    });

    it('不同玩家ID的击球消息都会被处理', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('host');

      const receivedPlayerIds: number[] = [];
      const callback = vi.fn((_aim, _power, playerId) => {
        receivedPlayerIds.push(playerId);
      });
      syncManager.onShotReceived(callback);

      syncManager.handleMessage('shot', { aimAngle: 0, power: 0.5, playerId: 0 }, 1);
      syncManager.handleMessage('shot', { aimAngle: 0, power: 0.5, playerId: 1 }, 2);

      expect(receivedPlayerIds).toEqual([0, 1]);
    });
  });

  describe('applyShotLocal - 本地击球执行', () => {
    it('执行击球后白球获得速度', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('host');

      const balls = [
        makeBall(0, { x: 200, y: 200 }),
        makeBall(1, { x: 300, y: 200 }),
      ];

      const result = syncManager.applyShotLocal(0, 0.5, 0, balls);

      expect(result).not.toBeNull();
      expect(result?.playerId).toBe(0);
      expect(result?.aimAngle).toBe(0);
      expect(result?.power).toBe(0.5);

      const cueBall = balls.find(b => b.id === 0)!;
      expect(cueBall.vel.x).toBeGreaterThan(0);
      expect(cueBall.vel.y).toBeCloseTo(0);
    });

    it('击球后返回 Shot 对象', () => {
      const balls = [makeBall(0, { x: 200, y: 200 })];

      const result = syncManager.applyShotLocal(Math.PI / 2, 0.8, 1, balls);

      expect(result).not.toBeNull();
      expect(result?.playerId).toBe(1);
      expect(result?.hits).toEqual([]);
      expect(result?.pocketedBalls).toEqual([]);
      expect(result?.foul).toBe(FoulType.NONE);
    });
  });

  describe('sendShotInput - 发送击球输入', () => {
    it('在线模式下发送击球消息', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('guest');

      syncManager.sendShotInput(0.5, 0.7, 1);

      expect(mockNetworkManager.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'shot',
          payload: expect.objectContaining({
            aimAngle: 0.5,
            power: 0.7,
            playerId: 1,
          }),
        })
      );
    });

    it('非在线模式下不发送击球消息', () => {
      syncManager.setPlayMode('coop');

      syncManager.sendShotInput(0.5, 0.7, 0);

      expect(mockNetworkManager.send).not.toHaveBeenCalled();
    });
  });

  describe('状态同步 - 击球后同步', () => {
    it('主机发送完整状态包含所有必要字段', () => {
      syncManager.setPlayMode('coop-online');
      syncManager.setRole('host');

      const balls = [makeBall(0), makeBall(1), makeBall(2)];
      const players = makeCoopPlayers();
      const teams = makeCoopTeams();

      const payload = syncManager.createFullStatePayload(
        balls,
        players,
        teams,
        1,
        0,
        'simulating',
        5,
        FoulType.NONE,
        null,
        true,
        null,
        false,
      );

      expect(payload.balls.length).toBe(3);
      expect(payload.currentPlayerId).toBe(1);
      expect(payload.currentTeamId).toBe(0);
      expect(payload.phase).toBe('simulating');
      expect(payload.turnNumber).toBe(5);
      expect(payload.groupsAssigned).toBe(true);
      expect(payload.seq).toBeGreaterThanOrEqual(0);
      expect(payload.timestamp).toBeGreaterThan(0);
    });
  });
});

describe('远程击球 - 集成场景', () => {
  let hostSync: NetworkSyncManager;
  let guestSync: NetworkSyncManager;

  beforeEach(() => {
    hostSync = new NetworkSyncManager();
    guestSync = new NetworkSyncManager();
    hostSync.reset();
    guestSync.reset();

    hostSync.setPlayMode('coop-online');
    hostSync.setRole('host');
    guestSync.setPlayMode('coop-online');
    guestSync.setRole('guest');

    vi.clearAllMocks();
  });

  it('客机发送击球，主机收到后执行 - 端到端流程', () => {
    let hostReceivedShot: { aimAngle: number; power: number; playerId: number } | null = null;

    hostSync.onShotReceived((aimAngle, power, playerId) => {
      hostReceivedShot = { aimAngle, power, playerId };
    });

    mockNetworkManager.send.mockImplementation((msg: { type: string; payload: unknown }) => {
      if (msg.type === 'shot') {
        hostSync.handleMessage('shot', msg.payload, 1);
      }
    });

    guestSync.sendShotInput(0.5, 0.8, 1);

    expect(hostReceivedShot).not.toBeNull();
    expect(hostReceivedShot?.aimAngle).toBe(0.5);
    expect(hostReceivedShot?.power).toBe(0.8);
    expect(hostReceivedShot?.playerId).toBe(1);
  });

  it('网络延迟场景：主机状态未更新时，客机击球仍被处理', () => {
    let shotCount = 0;

    hostSync.onShotReceived(() => {
      shotCount++;
    });

    mockNetworkManager.send.mockImplementation((msg: { type: string; payload: unknown }) => {
      if (msg.type === 'shot') {
        hostSync.handleMessage('shot', msg.payload, shotCount + 1);
      }
    });

    for (let i = 0; i < 3; i++) {
      guestSync.sendShotInput(i * 0.2, 0.5 + i * 0.1, i % 2);
    }

    expect(shotCount).toBe(3);
  });
});
