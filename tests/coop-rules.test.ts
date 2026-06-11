import { describe, it, expect } from 'vitest';
import type { Ball, Player, Team, Shot } from '../src/game/types';
import { FoulType } from '../src/game/types';
import { BALL_COLORS, BALL_RADIUS } from '../src/game/constants';
import { resolveCoopShot } from '../src/game/rules-coop';
import {
  hasTeamMultipleHumanPlayers,
  getNextTeammateId,
  isAITeam,
  getTeamGroup,
  isCoopMode,
  isOnlineCoop,
} from '../src/game/coop-helpers';

function makeBall(id: number, pocketed = false): Ball {
  const conf = BALL_COLORS[id] || { color: '#ffffff', stripe: false };
  return {
    id,
    number: id,
    pos: { x: 0, y: 0 },
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

function makeShot(opts: Partial<Shot> = {}): Shot {
  return {
    aimAngle: 0,
    power: 0.5,
    playerId: 0,
    timestamp: Date.now(),
    hits: [],
    pocketedBalls: [],
    foul: FoulType.NONE,
    ...opts,
  };
}

describe('coop-helpers - 合作模式工具函数', () => {
  describe('isCoopMode / isOnlineCoop', () => {
    it('正确识别合作模式', () => {
      expect(isCoopMode('coop')).toBe(true);
      expect(isCoopMode('coop-online')).toBe(true);
      expect(isCoopMode('pvp')).toBe(false);
      expect(isCoopMode('pve')).toBe(false);
    });

    it('正确识别在线合作模式', () => {
      expect(isOnlineCoop('coop-online')).toBe(true);
      expect(isOnlineCoop('coop')).toBe(false);
      expect(isOnlineCoop('pvp')).toBe(false);
    });
  });

  describe('hasTeamMultipleHumanPlayers - AI队伍切换修复', () => {
    it('人类合作队（2个玩家）返回 true', () => {
      const players = makeCoopPlayers();
      expect(hasTeamMultipleHumanPlayers(0, players)).toBe(true);
    });

    it('AI队（1个AI玩家）返回 false - 核心修复', () => {
      const players = makeCoopPlayers();
      expect(hasTeamMultipleHumanPlayers(1, players)).toBe(false);
    });

    it('单人队伍返回 false', () => {
      const players: Player[] = [
        { id: 0, name: '玩家1', isAI: false, score: 0, group: null, teamId: 0 },
        { id: 1, name: 'AI', isAI: true, score: 0, group: null, teamId: 1 },
      ];
      expect(hasTeamMultipleHumanPlayers(0, players)).toBe(false);
    });
  });

  describe('getNextTeammateId - 队友切换逻辑', () => {
    it('人类合作队有多个玩家时返回下一个队友ID', () => {
      const players = makeCoopPlayers();
      expect(getNextTeammateId(0, 0, players)).toBe(1);
      expect(getNextTeammateId(0, 1, players)).toBe(0);
    });

    it('AI队只有一个玩家时返回 null - 核心修复', () => {
      const players = makeCoopPlayers();
      expect(getNextTeammateId(1, 2, players)).toBeNull();
    });

    it('单人队伍返回 null', () => {
      const players: Player[] = [
        { id: 0, name: '玩家1', isAI: false, score: 0, group: null, teamId: 0 },
      ];
      expect(getNextTeammateId(0, 0, players)).toBeNull();
    });

    it('玩家不在队伍中返回 null', () => {
      const players = makeCoopPlayers();
      expect(getNextTeammateId(0, 99, players)).toBeNull();
    });
  });

  describe('isAITeam', () => {
    it('AI队返回 true', () => {
      const players = makeCoopPlayers();
      expect(isAITeam(1, players)).toBe(true);
    });

    it('人类队返回 false', () => {
      const players = makeCoopPlayers();
      expect(isAITeam(0, players)).toBe(false);
    });
  });

  describe('getTeamGroup', () => {
    it('合作模式下从队伍获取花色', () => {
      const players = makeCoopPlayers();
      const teams = makeCoopTeams();
      teams[0].group = 'solid';

      expect(getTeamGroup(players[0], teams, 'coop')).toBe('solid');
      expect(getTeamGroup(players[1], teams, 'coop')).toBe('solid');
    });

    it('非合作模式下从玩家获取花色', () => {
      const players = makeCoopPlayers();
      players[0].group = 'stripe';
      const teams = makeCoopTeams();

      expect(getTeamGroup(players[0], teams, 'pvp')).toBe('stripe');
    });
  });
});

describe('resolveCoopShot - 合作模式规则判定', () => {
  describe('AI队伍进球提示修复 - 核心Bug修复', () => {
    it('AI队打进球后提示"继续击打"而非"轮到队友"', () => {
      const balls = [
        makeBall(0),
        makeBall(1, true),
        makeBall(2),
        makeBall(3),
      ];
      const players = makeCoopPlayers();
      const teams = makeCoopTeams();
      teams[1].group = 'solid';

      const shot = makeShot({
        playerId: 2,
        pocketedBalls: [1],
        hits: [{ ballId: 1, timestamp: 0 }],
      });

      const result = resolveCoopShot(
        '8ball',
        balls,
        shot,
        players,
        2,
        FoulType.NONE,
        true,
        'coop',
        teams,
      );

      expect(result.switchToTeammate).toBe(false);
      expect(result.hintMessage).toContain('继续击打');
      expect(result.hintMessage).not.toContain('轮到队友');
    });

    it('人类合作队打进球后提示"轮到队友"', () => {
      const balls = [
        makeBall(0),
        makeBall(1, true),
        makeBall(2),
        makeBall(3),
      ];
      const players = makeCoopPlayers();
      const teams = makeCoopTeams();
      teams[0].group = 'solid';

      const shot = makeShot({
        playerId: 0,
        pocketedBalls: [1],
        hits: [{ ballId: 1, timestamp: 0 }],
      });

      const result = resolveCoopShot(
        '8ball',
        balls,
        shot,
        players,
        0,
        FoulType.NONE,
        true,
        'coop',
        teams,
      );

      expect(result.switchToTeammate).toBe(true);
      expect(result.hintMessage).toContain('轮到队友');
    });
  });

  describe('8球模式 - 合作规则', () => {
    it('合法打进己方球不换队，切换队友', () => {
      const balls = [
        makeBall(0),
        makeBall(1, true),
        makeBall(9),
        makeBall(10),
      ];
      const players = makeCoopPlayers();
      const teams = makeCoopTeams();
      teams[0].group = 'solid';
      teams[1].group = 'stripe';

      const shot = makeShot({
        playerId: 0,
        pocketedBalls: [1],
        hits: [{ ballId: 1, timestamp: 0 }],
      });

      const result = resolveCoopShot(
        '8ball',
        balls,
        shot,
        players,
        0,
        FoulType.NONE,
        true,
        'coop',
        teams,
      );

      expect(result.switchTurn).toBe(false);
      expect(result.switchTeam).toBe(false);
      expect(result.switchToTeammate).toBe(true);
      expect(result.scoreGained).toBe(1);
    });

    it('犯规时换对方队伍', () => {
      const balls = [
        makeBall(0, true),
        makeBall(1),
        makeBall(2),
      ];
      const players = makeCoopPlayers();
      const teams = makeCoopTeams();

      const shot = makeShot({
        playerId: 0,
        pocketedBalls: [0],
        hits: [{ ballId: 1, timestamp: 0 }],
      });

      const result = resolveCoopShot(
        '8ball',
        balls,
        shot,
        players,
        0,
        FoulType.CUE_BALL_POCKETED,
        false,
        'coop',
        teams,
      );

      expect(result.switchTurn).toBe(true);
      expect(result.switchTeam).toBe(true);
      expect(result.switchToTeammate).toBe(false);
      expect(result.hintMessage).toContain('犯规');
    });

    it('清完己方球后合法打进8号球，队伍获胜', () => {
      const balls = [
        makeBall(0),
        makeBall(8, true),
      ];
      const players = makeCoopPlayers();
      const teams = makeCoopTeams();
      teams[0].group = 'solid';

      const shot = makeShot({
        playerId: 0,
        pocketedBalls: [8],
        hits: [{ ballId: 8, timestamp: 0 }],
      });

      const result = resolveCoopShot(
        '8ball',
        balls,
        shot,
        players,
        0,
        FoulType.NONE,
        true,
        'coop',
        teams,
      );

      expect(result.gameOver).toBe(true);
      expect(result.winnerTeamId).toBe(0);
      expect(result.hintMessage).toContain('获胜');
    });
  });

  describe('9球模式 - 合作规则', () => {
    it('AI队打进9号球获胜，提示"继续击打"逻辑', () => {
      const balls = [
        makeBall(0),
        makeBall(9, true),
      ];
      const players = makeCoopPlayers();
      const teams = makeCoopTeams();

      const shot = makeShot({
        playerId: 2,
        pocketedBalls: [9],
        hits: [{ ballId: 1, timestamp: 0 }],
      });

      const result = resolveCoopShot(
        '9ball',
        balls,
        shot,
        players,
        2,
        FoulType.NONE,
        false,
        'coop',
        teams,
      );

      expect(result.gameOver).toBe(true);
      expect(result.winnerTeamId).toBe(1);
    });

    it('人类合作队打进普通球切换队友', () => {
      const balls = [
        makeBall(0),
        makeBall(1, true),
        makeBall(2),
        makeBall(9),
      ];
      const players = makeCoopPlayers();
      const teams = makeCoopTeams();

      const shot = makeShot({
        playerId: 0,
        pocketedBalls: [1],
        hits: [{ ballId: 1, timestamp: 0 }],
      });

      const result = resolveCoopShot(
        '9ball',
        balls,
        shot,
        players,
        0,
        FoulType.NONE,
        false,
        'coop',
        teams,
      );

      expect(result.switchTurn).toBe(false);
      expect(result.switchToTeammate).toBe(true);
      expect(result.hintMessage).toContain('轮到队友');
    });
  });

  describe('首次进袋分配花色 - 合作模式', () => {
    it('首次进袋后队伍分配花色，而非个人', () => {
      const balls = [
        makeBall(0),
        makeBall(1, true),
        makeBall(9),
        makeBall(10),
      ];
      const players = makeCoopPlayers();
      const teams = makeCoopTeams();

      const shot = makeShot({
        playerId: 0,
        pocketedBalls: [1],
        hits: [{ ballId: 1, timestamp: 0 }],
      });

      const result = resolveCoopShot(
        '8ball',
        balls,
        shot,
        players,
        0,
        FoulType.NONE,
        false,
        'coop',
        teams,
      );

      expect(result.groupsAssigned).toBe(true);
      expect(result.updatedTeams?.[0].group).toBe('solid');
      expect(result.updatedTeams?.[1].group).toBe('stripe');
    });
  });
});
