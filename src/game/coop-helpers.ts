import type { Player, PlayMode, Team } from './types';

export function isCoopMode(playMode: PlayMode): boolean {
  return playMode === 'coop' || playMode === 'coop-online';
}

export function isOnlineCoop(playMode: PlayMode): boolean {
  return playMode === 'coop-online';
}

export function getTeamGroup(
  player: Player,
  teams: Team[],
  playMode: PlayMode,
): 'solid' | 'stripe' | null | undefined {
  if (!isCoopMode(playMode)) return player.group;
  if (player.teamId === undefined || teams.length === 0) return player.group;
  const team = teams.find((t) => t.id === player.teamId);
  return team?.group;
}

export function getTeamForPlayer(player: Player, teams: Team[]): Team | undefined {
  if (player.teamId === undefined) return undefined;
  return teams.find((t) => t.id === player.teamId);
}

export function getTeamPlayers(teamId: number, players: Player[]): Player[] {
  return players.filter((p) => p.teamId === teamId);
}

export function getTeamHumanPlayers(teamId: number, players: Player[]): Player[] {
  return players.filter((p) => p.teamId === teamId && !p.isAI);
}

export function hasTeamMultipleHumanPlayers(teamId: number, players: Player[]): boolean {
  return getTeamHumanPlayers(teamId, players).length > 1;
}

export function isAITeam(teamId: number, players: Player[]): boolean {
  const teamPlayers = getTeamPlayers(teamId, players);
  return teamPlayers.length > 0 && teamPlayers.every((p) => p.isAI);
}

export function getOtherTeamId(currentTeamId: number, teams: Team[]): number {
  const other = teams.find((t) => t.id !== currentTeamId);
  return other?.id ?? currentTeamId;
}

export function getNextTeammateId(
  currentTeamId: number,
  currentPlayerId: number,
  players: Player[],
): number | null {
  const humans = getTeamHumanPlayers(currentTeamId, players);
  if (humans.length <= 1) return null;
  const idx = humans.findIndex((p) => p.id === currentPlayerId);
  if (idx === -1) return null;
  const nextIdx = (idx + 1) % humans.length;
  return humans[nextIdx].id;
}

export function getFirstPlayerOfTeam(teamId: number, players: Player[]): number {
  const teamPlayers = getTeamPlayers(teamId, players);
  return teamPlayers[0]?.id ?? 0;
}
