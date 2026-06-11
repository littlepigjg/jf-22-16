import type { Ball, FoulType, GameMode, Player, PlayMode, Shot, Team } from './types';
import { FoulType as FoulTypeEnum } from './types';
import { FOUL_MESSAGES } from './constants';
import { getTeamGroup, hasTeamMultipleHumanPlayers } from './coop-helpers';
import {
  calculateScoreAndUpdatePlayers,
  assignGroupsOnFirstPocket,
  clonePlayers,
} from './scoring';

export interface CoopResolveResult {
  switchTurn: boolean;
  switchTeam: boolean;
  switchToTeammate: boolean;
  gameOver: boolean;
  winnerId?: number;
  winnerTeamId?: number;
  hintMessage: string | null;
  updatedPlayers: Player[];
  updatedTeams?: Team[];
  groupsAssigned: boolean;
  scoredBallIds: number[];
  scoreGained: number;
}

export function resolveCoopShot(
  mode: GameMode,
  balls: Ball[],
  shot: Shot,
  players: Player[],
  currentPlayerId: number,
  foul: FoulType,
  groupsAssigned: boolean,
  playMode: PlayMode,
  teams: Team[],
): CoopResolveResult {
  const hasFoul = foul !== FoulTypeEnum.NONE;
  let switchTurn = true;
  let switchTeam = false;
  let switchToTeammate = false;
  let currentPlayers = clonePlayers(players);
  let currentTeams = teams.length > 0 ? [...teams] : undefined;

  const pocketedNonCue = shot.pocketedBalls.filter((id) => id !== 0);
  const currentPlayer = currentPlayers.find((p) => p.id === currentPlayerId)!;
  const currentTeamId = currentPlayer.teamId ?? 0;

  let groupsNowAssigned = groupsAssigned;
  let hintMessage: string | null = null;

  if (mode === '8ball' && !groupsAssigned && pocketedNonCue.length > 0 && !hasFoul) {
    const assignResult = assignGroupsOnFirstPocket(balls, pocketedNonCue, currentPlayers, currentPlayerId, playMode, currentTeams || []);
    currentPlayers = assignResult.updatedPlayers;
    if (assignResult.updatedTeams) {
      currentTeams = assignResult.updatedTeams;
    }
    groupsNowAssigned = assignResult.groupsAssigned;
    if (assignResult.hintMessage) {
      hintMessage = assignResult.hintMessage;
    }
  }

  const updatedCurrentPlayer = currentPlayers.find((p) => p.id === currentPlayerId)!;
  const group = getTeamGroup(updatedCurrentPlayer, currentTeams || [], playMode);
  const canSwitchTeammate = hasTeamMultipleHumanPlayers(currentTeamId, currentPlayers);

  if (mode === '8ball') {
    if (group && !hasFoul) {
      const ownGroupPocketed = pocketedNonCue.filter((id) => {
        const ball = balls.find((b) => b.id === id);
        if (!ball || ball.id === 8) return false;
        return (group === 'solid' && !ball.stripe) || (group === 'stripe' && ball.stripe);
      });

      if (ownGroupPocketed.length > 0) {
        switchTurn = false;
        if (canSwitchTeammate) {
          switchToTeammate = true;
          hintMessage = `好球！打进 ${ownGroupPocketed.length} 颗，轮到队友`;
        } else {
          hintMessage = `好球！打进 ${ownGroupPocketed.length} 颗，继续击打`;
        }
      }
    }

    const eightBall = balls.find((b) => b.id === 8);
    if (eightBall?.pocketed) {
      const groupBallsRemaining = balls.filter(
        (b) => !b.pocketed && b.id !== 0 && b.id !== 8 && ((group === 'solid' && !b.stripe) || (group === 'stripe' && b.stripe)),
      ).length;

      if (groupBallsRemaining === 0 && !hasFoul) {
        const scoreResult = calculateScoreAndUpdatePlayers(mode, balls, shot, currentPlayers, currentPlayerId, hasFoul, playMode, currentTeams || []);
        if (scoreResult.updatedTeams) {
          currentTeams = scoreResult.updatedTeams;
        }
        const currentTeam = currentTeams?.find((t) => t.id === currentTeamId);
        return {
          switchTurn: false,
          switchTeam: false,
          switchToTeammate: false,
          gameOver: true,
          winnerId: currentPlayerId,
          winnerTeamId: currentTeamId,
          hintMessage: `${currentTeam?.name || '队伍'} 获胜！`,
          updatedPlayers: scoreResult.updatedPlayers,
          updatedTeams: currentTeams,
          groupsAssigned: groupsNowAssigned,
          scoredBallIds: scoreResult.scoredBallIds,
          scoreGained: scoreResult.scoreGained,
        };
      }
      if (hasFoul || groupBallsRemaining > 0) {
        const otherTeamId = currentTeams?.find((t) => t.id !== currentTeamId)?.id;
        const otherTeam = currentTeams?.find((t) => t.id === otherTeamId);
        return {
          switchTurn: true,
          switchTeam: true,
          switchToTeammate: false,
          gameOver: true,
          winnerId: undefined,
          winnerTeamId: otherTeamId,
          hintMessage: `${otherTeam?.name || '对方队伍'} 获胜！`,
          updatedPlayers: currentPlayers,
          updatedTeams: currentTeams,
          groupsAssigned: groupsNowAssigned,
          scoredBallIds: [],
          scoreGained: 0,
        };
      }
    }
  }

  if (mode === '9ball') {
    if (pocketedNonCue.includes(9) && !hasFoul) {
      const scoreResult = calculateScoreAndUpdatePlayers(mode, balls, shot, currentPlayers, currentPlayerId, hasFoul, playMode, currentTeams || []);
      if (scoreResult.updatedTeams) {
        currentTeams = scoreResult.updatedTeams;
      }
      const currentTeam = currentTeams?.find((t) => t.id === currentTeamId);
      return {
        switchTurn: false,
        switchTeam: false,
        switchToTeammate: false,
        gameOver: true,
        winnerId: currentPlayerId,
        winnerTeamId: currentTeamId,
        hintMessage: `${currentTeam?.name || '队伍'} 获胜！`,
        updatedPlayers: scoreResult.updatedPlayers,
        updatedTeams: currentTeams,
        groupsAssigned: groupsNowAssigned,
        scoredBallIds: scoreResult.scoredBallIds,
        scoreGained: scoreResult.scoreGained,
      };
    }

    if (pocketedNonCue.length > 0 && !hasFoul) {
      switchTurn = false;
      if (canSwitchTeammate) {
        switchToTeammate = true;
        hintMessage = `好球！打进 ${pocketedNonCue.length} 颗，轮到队友`;
      } else {
        hintMessage = `好球！打进 ${pocketedNonCue.length} 颗，继续击打`;
      }
    }
  }

  if (hasFoul) {
    switchTurn = true;
    switchTeam = true;
    switchToTeammate = false;
    if (!hintMessage) {
      hintMessage = '犯规！换对方队伍击球';
    }
  }

  const scoreResult = calculateScoreAndUpdatePlayers(mode, balls, shot, currentPlayers, currentPlayerId, hasFoul, playMode, currentTeams || []);
  if (scoreResult.updatedTeams) {
    currentTeams = scoreResult.updatedTeams;
  }

  return {
    switchTurn,
    switchTeam,
    switchToTeammate,
    gameOver: false,
    hintMessage,
    updatedPlayers: scoreResult.updatedPlayers,
    updatedTeams: currentTeams,
    groupsAssigned: groupsNowAssigned,
    scoredBallIds: scoreResult.scoredBallIds,
    scoreGained: scoreResult.scoreGained,
  };
}

export function checkCoopFoul(
  mode: GameMode,
  balls: Ball[],
  shot: Shot,
  currentPlayer: Player,
  groupsAssigned: boolean,
  teams: Team[],
  playMode: PlayMode,
): { foul: FoulType; message: string | null } {
  const group = getTeamGroup(currentPlayer, teams, playMode);
  const activeBalls = balls.filter((b) => !b.pocketed && b.id !== 0);

  let legalFirstBalls: number[];
  if (mode === '9ball') {
    if (activeBalls.length === 0) return { foul: FoulTypeEnum.NONE, message: null };
    legalFirstBalls = [Math.min(...activeBalls.map((b) => b.id))];
  } else if (mode === '8ball') {
    if (!groupsAssigned) {
      legalFirstBalls = activeBalls.filter((b) => b.id !== 8).map((b) => b.id);
    } else if (group === 'solid') {
      const solids = activeBalls.filter((b) => !b.stripe && b.id !== 8);
      legalFirstBalls = solids.length > 0 ? solids.map((b) => b.id) : [8];
    } else if (group === 'stripe') {
      const stripes = activeBalls.filter((b) => b.stripe && b.id !== 8);
      legalFirstBalls = stripes.length > 0 ? stripes.map((b) => b.id) : [8];
    } else {
      legalFirstBalls = activeBalls.map((b) => b.id);
    }
  } else {
    legalFirstBalls = activeBalls.map((b) => b.id);
  }

  const cueBallPocketed = shot.pocketedBalls.includes(0);
  if (cueBallPocketed) {
    return { foul: FoulTypeEnum.CUE_BALL_POCKETED, message: FOUL_MESSAGES.CUE_BALL_POCKETED };
  }

  const firstHitId = shot.hits.length > 0 ? shot.hits[0].ballId : null;
  if (firstHitId === null) {
    return { foul: FoulTypeEnum.NO_BALL_HIT, message: FOUL_MESSAGES.NO_BALL_HIT };
  }

  if (!legalFirstBalls.includes(firstHitId)) {
    return { foul: FoulTypeEnum.WRONG_FIRST_CONTACT, message: FOUL_MESSAGES.WRONG_FIRST_CONTACT };
  }

  if (mode === '8ball') {
    const eightInThisShot = shot.pocketedBalls.includes(8);
    if (groupsAssigned && group) {
      const groupBallsRemaining = balls.filter(
        (b) => !b.pocketed && b.id !== 0 && b.id !== 8 && ((group === 'solid' && !b.stripe) || (group === 'stripe' && b.stripe)),
      ).length;

      if (eightInThisShot && groupBallsRemaining > 0) {
        return { foul: FoulTypeEnum.EIGHT_BALL_POCKETED_EARLY, message: FOUL_MESSAGES.EIGHT_BALL_POCKETED_EARLY };
      }
    }
  }

  return { foul: FoulTypeEnum.NONE, message: null };
}
