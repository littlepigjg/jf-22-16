export interface Vec2 {
  x: number;
  y: number;
}

export interface Ball {
  id: number;
  pos: Vec2;
  vel: Vec2;
  acc: Vec2;
  radius: number;
  color: string;
  stripe: boolean;
  pocketed: boolean;
  pocketedAt: number | null;
  spin: Vec2;
  number: number;
}

export interface Pocket {
  pos: Vec2;
  radius: number;
}

export interface Table {
  width: number;
  height: number;
  x: number;
  y: number;
  borderWidth: number;
  pockets: Pocket[];
}

export interface HitRecord {
  ballId: number;
  timestamp: number;
}

export enum FoulType {
  NONE = 'NONE',
  CUE_BALL_POCKETED = 'CUE_BALL_POCKETED',
  WRONG_FIRST_CONTACT = 'WRONG_FIRST_CONTACT',
  NO_BALL_HIT = 'NO_BALL_HIT',
  EIGHT_BALL_POCKETED_EARLY = 'EIGHT_BALL_POCKETED_EARLY',
}

export interface Shot {
  aimAngle: number;
  power: number;
  playerId: number;
  timestamp: number;
  hits: HitRecord[];
  pocketedBalls: number[];
  foul: FoulType;
}

export interface Player {
  id: number;
  name: string;
  isAI: boolean;
  aiDifficulty?: 'easy' | 'hard';
  group?: 'solid' | 'stripe' | null;
  score: number;
  teamId?: number;
}

export interface Team {
  id: number;
  name: string;
  playerIds: number[];
  group?: 'solid' | 'stripe' | null;
  score: number;
}

export type GameMode = '8ball' | '9ball';
export type PlayMode = 'pvp' | 'pve' | 'coop' | 'coop-online';
export type CoopSubMode = 'local' | 'online';
export type NetworkRole = 'host' | 'guest' | null;
export type NetworkStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type NetworkMessageType =
  | 'shot'
  | 'state-sync'
  | 'state-full-sync'
  | 'state-partial-sync'
  | 'input-request'
  | 'player-ready'
  | 'aim-update'
  | 'chat'
  | 'sync-ack'
  | 'turn-start';

export interface NetworkMessage {
  type: NetworkMessageType;
  payload: unknown;
  timestamp: number;
  senderId: string;
  seq?: number;
}

export interface StateSyncPayload {
  balls: {
    id: number;
    pos: { x: number; y: number };
    vel: { x: number; y: number };
    pocketed: boolean;
  }[];
  players: Player[];
  teams: Team[];
  currentPlayerId: number;
  currentTeamId: number;
  phase: GamePhase;
  turnNumber: number;
  foul: FoulType;
  foulMessage: string | null;
  groupsAssigned: boolean;
  targetBallHint: string | null;
  freeBall: boolean;
  seq: number;
  timestamp: number;
}

export interface PartialSyncPayload {
  balls?: {
    id: number;
    pos: { x: number; y: number };
    vel: { x: number; y: number };
    pocketed: boolean;
  }[];
  currentPlayerId?: number;
  currentTeamId?: number;
  phase?: GamePhase;
  turnNumber?: number;
  foul?: FoulType;
  foulMessage?: string | null;
  groupsAssigned?: boolean;
  targetBallHint?: string | null;
  freeBall?: boolean;
  shotResult?: {
    pocketedBalls: number[];
    scoredBallIds: number[];
    scoreGained: number;
    switchTurn: boolean;
    switchTeam: boolean;
    switchToTeammate: boolean;
  };
  seq: number;
  timestamp: number;
}

export interface ShotInputPayload {
  aimAngle: number;
  power: number;
  playerId: number;
}

export interface SyncAckPayload {
  seq: number;
  timestamp: number;
}

export interface NetworkState {
  status: NetworkStatus;
  role: NetworkRole;
  peerId: string | null;
  localId: string;
  sessionId: string | null;
  error: string | null;
}
export type GamePhase =
  | 'setup'
  | 'aiming'
  | 'charging'
  | 'shooting'
  | 'simulating'
  | 'resolving'
  | 'gameover';

export interface GameState {
  mode: GameMode;
  playMode: PlayMode;
  phase: GamePhase;
  balls: Ball[];
  table: Table;
  currentPlayerId: number;
  currentTeamId: number;
  players: Player[];
  teams: Team[];
  currentShot: Shot | null;
  shotHistory: Shot[];
  foul: FoulType;
  foulMessage: string | null;
  winner: Player | Team | null;
  turnNumber: number;
  targetBallHint: string | null;
  replayRecording: boolean;
  freeBall: boolean;
  groupsAssigned: boolean;
}

export interface ReplayFile {
  id: string;
  timestamp: number;
  duration: number;
  mode: GameMode;
  players: Player[];
  winner: Player | null;
  initialBalls: Ball[];
  shots: Shot[];
  frames: ReplayFrame[];
}

export interface ReplayFrame {
  frameIndex: number;
  balls: Ball[];
  phase: GamePhase;
  currentPlayerId: number;
}

export interface AIShotDecision {
  aimAngle: number;
  power: number;
  targetBallId: number;
}
