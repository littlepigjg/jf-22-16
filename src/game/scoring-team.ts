import type { Ball, GameMode, Player, Shot, Team } from './types';

export interface TeamScoreResult {
  scoredBallIds: number[];
  scoreGained: number;
  updatedPlayers: Player[];
  updatedTeams: Team[];
}

export function calculateTeamScore(
  mode: GameMode,
  balls: Ball[],
  shot: Shot,
  players: Player[],
  currentPlayerId: number,
  foul: boolean,
  teams: Team[],
): TeamScoreResult {
  const pocketedNonCue = shot.pocketedBalls.filter((id) => id !== 0);
  const currentPlayer = players.find((p) => p.id === currentPlayerId)!;
  const currentTeamId = currentPlayer.teamId;
  const currentTeam = teams.find((t) => t.id === currentTeamId);
  const group = currentTeam?.group;

  const scoredBallIds: number[] = [];
  for (const id of pocketedNonCue) {
    if (shouldCountTeamScore(mode, balls, id, group)) {
      scoredBallIds.push(id);
    }
  }

  const scoreGained = foul ? 0 : scoredBallIds.length;

  const updatedTeams = teams.map((t) => {
    if (t.id === currentTeamId) {
      return { ...t, score: t.score + scoreGained };
    }
    return { ...t };
  });

  const updatedPlayers = players.map((p) => {
    if (p.id === currentPlayerId) {
      return { ...p, score: p.score + scoreGained };
    }
    return { ...p };
  });

  return { scoredBallIds, scoreGained, updatedPlayers, updatedTeams };
}

function shouldCountTeamScore(
  mode: GameMode,
  balls: Ball[],
  ballId: number,
  group: 'solid' | 'stripe' | null | undefined,
): boolean {
  const ball = balls.find((b) => b.id === ballId);
  if (!ball) return false;

  if (mode === '8ball') {
    if (ballId === 8) return false;
    if (!group) return true;
    if (group === 'solid') return !ball.stripe;
    return ball.stripe;
  }

  if (mode === '9ball') {
    return ballId !== 9;
  }

  return false;
}

export function assignGroupsForTeams(
  balls: Ball[],
  pocketedNonCue: number[],
  players: Player[],
  currentPlayerId: number,
  teams: Team[],
): {
  updatedPlayers: Player[];
  updatedTeams: Team[];
  groupsAssigned: boolean;
  hintMessage: string | null;
} {
  if (pocketedNonCue.length === 0) {
    return { updatedPlayers: players, updatedTeams: teams, groupsAssigned: false, hintMessage: null };
  }

  const firstPocketed = pocketedNonCue[0];
  const ball = balls.find((b) => b.id === firstPocketed);
  if (!ball || ball.id === 8) {
    return { updatedPlayers: players, updatedTeams: teams, groupsAssigned: false, hintMessage: null };
  }

  const currentPlayer = players.find((p) => p.id === currentPlayerId)!;
  const currentTeamId = currentPlayer.teamId;
  if (currentTeamId === undefined) {
    return { updatedPlayers: players, updatedTeams: teams, groupsAssigned: false, hintMessage: null };
  }

  const currentTeam = teams.find((t) => t.id === currentTeamId);
  const otherTeam = teams.find((t) => t.id !== currentTeamId);

  if (currentTeam?.group || otherTeam?.group) {
    return { updatedPlayers: players, updatedTeams: teams, groupsAssigned: true, hintMessage: null };
  }

  const team1Group: 'solid' | 'stripe' = ball.stripe ? 'stripe' : 'solid';
  const team2Group: 'solid' | 'stripe' = team1Group === 'solid' ? 'stripe' : 'solid';

  const updatedTeams = teams.map((t) => {
    if (t.id === currentTeamId) return { ...t, group: team1Group };
    return { ...t, group: team2Group };
  });

  const updatedPlayers = players.map((p) => {
    const team = updatedTeams.find((t) => t.id === p.teamId);
    return { ...p, group: team?.group };
  });

  const teamName = currentTeam?.name || '队伍';
  const groupLabel = team1Group === 'solid' ? '全色球' : '半色球';

  return {
    updatedPlayers,
    updatedTeams,
    groupsAssigned: true,
    hintMessage: `${teamName} 已分配：${groupLabel}`,
  };
}
