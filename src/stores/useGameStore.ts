import { create } from 'zustand';
import type {
  Ball,
  GameMode,
  GamePhase,
  GameState,
  Player,
  PlayMode,
  Shot,
  Team,
  StateSyncPayload,
  PartialSyncPayload,
} from '../game/types';
import { FoulType as FoulTypeEnum } from '../game/types';
import {
  MAX_POWER,
  TABLE,
} from '../game/constants';
import { setupBalls, resetCueBall, placeCueBall } from '../game/table-setup';
import { applyShot, allBallsStopped, stepPhysics } from '../game/physics';
import { checkFoul, resolveShot, getLegalFirstBalls } from '../game/rules';
import { decideAIShot } from '../game/ai';
import {
  startRecording,
  recordShot as recordReplayShot,
  recordFrame,
  stopRecording,
  generateReplay,
} from '../game/replay';
import { saveReplay } from '../utils/storage';
import {
  isCoopMode,
  isOnlineCoop,
  getOtherTeamId,
  getNextTeammateId,
  getFirstPlayerOfTeam,
} from '../game/coop-helpers';
import { networkSync } from '../game/network-sync';
import { useNetworkStore } from './useNetworkStore';

interface UIState {
  aimAngle: number;
  power: number;
  isCharging: boolean;
  showAimLine: boolean;
  selectedGameMode: GameMode;
  selectedPlayMode: PlayMode;
  selectedAIDifficulty: 'easy' | 'hard';
  selectedCoopSubMode: 'local' | 'online';
  menuTab: 'home' | 'replays';
  replayId: string | null;
  replayProgress: number;
  replayPlaying: boolean;
  replaySpeed: number;
  showCoopLobby: boolean;
}

interface GameStore extends GameState, UIState {
  startGame: (
    mode: GameMode,
    playMode: PlayMode,
    aiDifficulty: 'easy' | 'hard',
    coopSubMode?: 'local' | 'online',
  ) => void;
  resetGame: () => void;
  setAimAngle: (angle: number) => void;
  startCharge: () => void;
  updateCharge: (dt: number) => void;
  releaseShot: () => void;
  placeFreeBall: (x: number, y: number) => void;
  simulateStep: () => void;
  resolveTurn: () => void;
  aiTakeTurn: () => void;
  tickAITimer: () => boolean;
  setShowAimLine: (v: boolean) => void;
  setSelectedGameMode: (m: GameMode) => void;
  setSelectedPlayMode: (m: PlayMode) => void;
  setSelectedAIDifficulty: (d: 'easy' | 'hard') => void;
  setSelectedCoopSubMode: (s: 'local' | 'online') => void;
  setMenuTab: (t: 'home' | 'replays') => void;
  setReplayId: (id: string | null) => void;
  setReplayProgress: (p: number) => void;
  setReplayPlaying: (p: boolean) => void;
  setReplaySpeed: (s: number) => void;
  saveReplayToStorage: () => boolean;
  setPhase: (p: GamePhase) => void;
  setBalls: (balls: Ball[]) => void;
  setTeams: (teams: Team[]) => void;
  clearFoul: () => void;
  backToMenu: () => void;
  setShowCoopLobby: (v: boolean) => void;
  applyRemoteShot: (aimAngle: number, power: number, playerId: number) => void;
  applyFullStateSync: (payload: StateSyncPayload) => void;
  applyPartialStateSync: (payload: PartialSyncPayload) => void;
  isHost: () => boolean;
  isGuest: () => boolean;
  isOnline: () => boolean;
  canControlCurrentPlayer: () => boolean;
  sendFullState: () => void;
  sendPartialState: (partial: Partial<Pick<PartialSyncPayload, keyof PartialSyncPayload>>) => void;
}

function createPlayers(
  playMode: PlayMode,
  aiDifficulty: 'easy' | 'hard',
  isOnline: boolean = false,
): Player[] {
  const coopMode = isCoopMode(playMode);

  if (coopMode) {
    if (isOnline) {
      const isHost = useNetworkStore.getState().isHost;
      const p1: Player = {
        id: 0,
        name: isHost ? '玩家 1（你）' : '玩家 1',
        isAI: false,
        group: null,
        score: 0,
        teamId: 0,
      };
      const p2: Player = {
        id: 1,
        name: isHost ? '玩家 2' : '玩家 2（你）',
        isAI: false,
        group: null,
        score: 0,
        teamId: 0,
      };
      const p3: Player = {
        id: 2,
        name: 'AI 对手',
        isAI: true,
        aiDifficulty,
        group: null,
        score: 0,
        teamId: 1,
      };
      return [p1, p2, p3];
    }

    const p1: Player = {
      id: 0,
      name: '玩家 1',
      isAI: false,
      group: null,
      score: 0,
      teamId: 0,
    };
    const p2: Player = {
      id: 1,
      name: '玩家 2',
      isAI: false,
      group: null,
      score: 0,
      teamId: 0,
    };
    const p3: Player = {
      id: 2,
      name: 'AI 对手',
      isAI: true,
      aiDifficulty,
      group: null,
      score: 0,
      teamId: 1,
    };
    return [p1, p2, p3];
  }

  const p1: Player = {
    id: 0,
    name: playMode === 'pvp' ? '玩家 1' : '玩家',
    isAI: false,
    group: null,
    score: 0,
    teamId: undefined,
  };
  const p2: Player = {
    id: 1,
    name: playMode === 'pvp' ? '玩家 2' : 'AI 对手',
    isAI: playMode === 'pve',
    aiDifficulty: playMode === 'pve' ? aiDifficulty : undefined,
    group: null,
    score: 0,
    teamId: undefined,
  };
  return [p1, p2];
}

function createTeams(playMode: PlayMode): Team[] {
  if (!isCoopMode(playMode)) return [];

  return [
    {
      id: 0,
      name: '玩家队伍',
      playerIds: [0, 1],
      group: null,
      score: 0,
    },
    {
      id: 1,
      name: 'AI 对手',
      playerIds: [2],
      group: null,
      score: 0,
    },
  ];
}

function getLocalPlayerId(playMode: PlayMode): number {
  if (!isOnlineCoop(playMode)) return 0;
  const netState = useNetworkStore.getState();
  return netState.isHost ? 0 : 1;
}

function mergeBallsState(currentBalls: Ball[], syncBalls: StateSyncPayload['balls']): Ball[] {
  return currentBalls.map((ball) => {
    const synced = syncBalls.find((b) => b.id === ball.id);
    if (!synced) return ball;
    return {
      ...ball,
      pos: { ...synced.pos },
      vel: { ...synced.vel },
      pocketed: synced.pocketed,
    };
  });
}

export const useGameStore = create<GameStore>((set, get) => {
  networkSync.onFullSync((payload) => {
    get().applyFullStateSync(payload);
  });

  networkSync.onPartialSync((payload) => {
    get().applyPartialStateSync(payload);
  });

  networkSync.onShotReceived((aimAngle, power, playerId) => {
    const s = get();
    if (!networkSync.isHost() || s.currentPlayerId !== playerId) return;
    if (s.phase !== 'aiming') return;
    get().applyRemoteShot(aimAngle, power, playerId);
  });

  return {
    mode: '8ball',
    playMode: 'pvp',
    phase: 'setup',
    balls: [],
    table: TABLE,
    currentPlayerId: 0,
    currentTeamId: 0,
    players: [],
    teams: [],
    currentShot: null,
    shotHistory: [],
    foul: FoulTypeEnum.NONE,
    foulMessage: null,
    winner: null,
    turnNumber: 1,
    targetBallHint: null,
    replayRecording: false,
    freeBall: false,
    groupsAssigned: false,

    aimAngle: 0,
    power: 0,
    isCharging: false,
    showAimLine: true,
    selectedGameMode: '8ball',
    selectedPlayMode: 'pve',
    selectedAIDifficulty: 'easy',
    selectedCoopSubMode: 'local',
    menuTab: 'home',
    replayId: null,
    replayProgress: 0,
    replayPlaying: false,
    replaySpeed: 1,
    showCoopLobby: false,

    isHost: () => networkSync.isHost(),
    isGuest: () => networkSync.isGuest(),
    isOnline: () => networkSync.isOnlineMode(),
    canControlCurrentPlayer: () => {
      const s = get();
      return networkSync.canControlPlayer(s.currentPlayerId, s.players);
    },

    sendFullState: () => {
      const s = get();
      if (!networkSync.isHost() || !networkSync.isOnlineMode()) return;
      networkSync.sendFullState(
        s.balls,
        s.players,
        s.teams,
        s.currentPlayerId,
        s.currentTeamId,
        s.phase,
        s.turnNumber,
        s.foul,
        s.foulMessage,
        s.groupsAssigned,
        s.targetBallHint,
        s.freeBall,
      );
    },

    sendPartialState: (partial) => {
      if (!networkSync.isHost() || !networkSync.isOnlineMode()) return;
      networkSync.sendPartialState(partial);
    },

    startGame: (mode, playMode, aiDifficulty, coopSubMode = 'local') => {
      const balls = setupBalls(mode);
      const online = isOnlineCoop(playMode) && coopSubMode === 'online';
      const players = createPlayers(playMode, aiDifficulty, online);
      const teams = createTeams(playMode);
      startRecording(balls);

      networkSync.setPlayMode(playMode);

      set({
        mode,
        playMode,
        balls,
        players,
        teams,
        phase: 'aiming',
        currentPlayerId: 0,
        currentTeamId: isCoopMode(playMode) ? 0 : 0,
        currentShot: null,
        shotHistory: [],
        foul: FoulTypeEnum.NONE,
        foulMessage: null,
        winner: null,
        turnNumber: 1,
        targetBallHint: null,
        replayRecording: true,
        freeBall: false,
        groupsAssigned: false,
        aimAngle: 0,
        power: 0,
        isCharging: false,
        selectedCoopSubMode: isCoopMode(playMode) ? coopSubMode : 'local',
        showCoopLobby: false,
      });

      if (networkSync.isHost() && online) {
        setTimeout(() => {
          get().sendFullState();
        }, 100);
      }
    },

    resetGame: () => {
      const { mode, playMode, selectedAIDifficulty, selectedCoopSubMode } = get();
      get().startGame(mode, playMode, selectedAIDifficulty, selectedCoopSubMode);
    },

    setAimAngle: (angle) => {
      set({ aimAngle: angle });
      const s = get();
      if (networkSync.isOnlineMode() && get().canControlCurrentPlayer()) {
        networkSync.sendAimUpdate(angle);
      }
    },

    startCharge: () => {
      const { phase, freeBall } = get();
      if (phase !== 'aiming' || freeBall) return;
      if (networkSync.isOnlineMode() && !get().canControlCurrentPlayer()) return;
      set({ isCharging: true, power: 0.05, phase: 'charging' });
    },

    updateCharge: (dt) => {
      const { isCharging, power } = get();
      if (!isCharging) return;
      const newPower = Math.min(1, power + dt * 0.9);
      set({ power: newPower });
    },

    releaseShot: () => {
      const s = get();
      if (!s.isCharging) return;
      if (networkSync.isOnlineMode() && !get().canControlCurrentPlayer()) return;

      const shot: Shot = {
        aimAngle: s.aimAngle,
        power: s.power,
        playerId: s.currentPlayerId,
        timestamp: Date.now(),
        hits: [],
        pocketedBalls: [],
        foul: FoulTypeEnum.NONE,
      };

      if (networkSync.shouldRunPhysics()) {
        applyShot(s.balls, s.aimAngle, s.power, MAX_POWER);
        recordReplayShot(shot);
      }

      if (networkSync.isOnlineMode()) {
        networkSync.sendShotInput(s.aimAngle, s.power, s.currentPlayerId);
      }

      set({ isCharging: false, currentShot: shot, phase: 'simulating', power: 0 });
    },

    placeFreeBall: (x, y) => {
      const { balls, freeBall, phase } = get();
      if (!freeBall || phase !== 'aiming') return;
      if (networkSync.isOnlineMode() && !get().canControlCurrentPlayer()) return;

      const newCue = placeCueBall(x, y);
      const updated = balls.map((b) => (b.id === 0 ? newCue : b));
      set({ balls: updated, freeBall: false });

      if (networkSync.isHost()) {
        get().sendPartialState({
          balls: networkSync.createBallDiff(balls, updated),
          freeBall: false,
        });
      }
    },

    simulateStep: () => {
      const s = get();
      if (s.phase !== 'simulating') return;

      if (!networkSync.shouldRunPhysics()) {
        return;
      }

      const substeps = 2;
      const allNewPocketedIds: number[] = [];
      const oldBalls = s.balls.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel } }));

      for (let i = 0; i < substeps; i++) {
        const result = stepPhysics(s.balls, 1 / 120, s.currentShot?.hits, Date.now());
        if (result.pocketedBalls.length > 0) {
          allNewPocketedIds.push(...result.pocketedBalls);
        }
      }

      if (s.currentShot && allNewPocketedIds.length > 0) {
        const deduplicated = allNewPocketedIds.filter(
          (id) => !s.currentShot!.pocketedBalls.includes(id),
        );
        if (deduplicated.length > 0) {
          s.currentShot.pocketedBalls.push(...deduplicated);
        }
      }

      recordFrame(s.balls, s.phase, s.currentPlayerId);

      if (networkSync.isHost()) {
        const ballDiff = networkSync.createBallDiff(oldBalls, s.balls);
        if (ballDiff && ballDiff.length > 0) {
          get().sendPartialState({ balls: ballDiff });
        }
      }

      if (allBallsStopped(s.balls)) {
        set({ phase: 'resolving' });
      }
    },

    resolveTurn: () => {
      const s = get();
      if (s.phase !== 'resolving' || !s.currentShot) return;

      if (!networkSync.shouldRunPhysics()) {
        return;
      }

      const currentPlayer = s.players.find((p) => p.id === s.currentPlayerId)!;
      const coopMode = isCoopMode(s.playMode);
      const foulResult = checkFoul(s.mode, s.balls, s.currentShot, currentPlayer, s.groupsAssigned, s.teams, s.playMode);
      s.currentShot.foul = foulResult.foul;

      const resolve = resolveShot(
        s.mode,
        s.balls,
        s.currentShot,
        s.players,
        s.currentPlayerId,
        foulResult.foul,
        s.groupsAssigned,
        s.playMode,
        s.teams,
      );

      const updatedPlayers = resolve.updatedPlayers;
      const updatedTeams = resolve.updatedTeams || s.teams;
      const groupsAssigned = resolve.groupsAssigned;

      const shotHistory = [...s.shotHistory, s.currentShot];
      let nextPlayerId = s.currentPlayerId;
      let nextTeamId = s.currentTeamId;
      let freeBall = false;

      if (coopMode) {
        if (resolve.switchTeam) {
          nextTeamId = getOtherTeamId(s.currentTeamId, updatedTeams);
          nextPlayerId = getFirstPlayerOfTeam(nextTeamId, updatedPlayers);
        } else if (resolve.switchToTeammate) {
          const teammateId = getNextTeammateId(s.currentTeamId, s.currentPlayerId, updatedPlayers);
          if (teammateId !== null) {
            nextPlayerId = teammateId;
          } else {
            nextPlayerId = s.currentPlayerId;
          }
        } else if (resolve.switchTurn) {
          nextTeamId = getOtherTeamId(s.currentTeamId, updatedTeams);
          nextPlayerId = getFirstPlayerOfTeam(nextTeamId, updatedPlayers);
        }
      } else {
        if (resolve.switchTurn) {
          nextPlayerId = updatedPlayers.find((p) => p.id !== s.currentPlayerId)!.id;
        }
      }

      if (foulResult.foul !== FoulTypeEnum.NONE) {
        freeBall = true;
      }

      const nextPlayer = updatedPlayers.find((p) => p.id === nextPlayerId)!;
      const legalBalls = getLegalFirstBalls(s.mode, s.balls, nextPlayer, groupsAssigned, updatedTeams, s.playMode);
      const legalBall = s.balls.find((b) => b.id === legalBalls[0]);
      const hint = resolve.hintMessage || (legalBall ? `目标球: ${legalBall.id}号` : null);

      if (resolve.gameOver) {
        stopRecording();
        let winner: Player | Team | null = null;
        if (coopMode && resolve.winnerTeamId !== undefined) {
          winner = updatedTeams.find((t) => t.id === resolve.winnerTeamId) || null;
        } else if (resolve.winnerId !== undefined) {
          winner = updatedPlayers.find((p) => p.id === resolve.winnerId) || null;
        }
        set({
          players: updatedPlayers,
          teams: updatedTeams,
          winner,
          phase: 'gameover',
          shotHistory,
          foul: foulResult.foul,
          foulMessage: foulResult.message || resolve.hintMessage,
          targetBallHint: resolve.hintMessage,
          replayRecording: false,
          groupsAssigned,
        });

        if (networkSync.isHost()) {
          get().sendFullState();
        }
        return;
      }

      if (foulResult.foul === FoulTypeEnum.CUE_BALL_POCKETED) {
        const updated = s.balls.map((b) => (b.id === 0 ? resetCueBall() : b));
        set({ balls: updated });
      }

      const turnNumber = resolve.switchTurn || resolve.switchTeam ? s.turnNumber + 1 : s.turnNumber;

      set({
        players: updatedPlayers,
        teams: updatedTeams,
        currentPlayerId: nextPlayerId,
        currentTeamId: nextTeamId,
        shotHistory,
        foul: foulResult.foul,
        foulMessage: foulResult.message,
        targetBallHint: hint,
        freeBall,
        groupsAssigned,
        turnNumber,
        phase: 'aiming',
        currentShot: null,
      });

      if (networkSync.isHost()) {
        get().sendPartialState({
          currentPlayerId: nextPlayerId,
          currentTeamId: nextTeamId,
          turnNumber,
          phase: 'aiming',
          foul: foulResult.foul,
          foulMessage: foulResult.message,
          targetBallHint: hint,
          freeBall,
          groupsAssigned,
          shotResult: {
            pocketedBalls: s.currentShot?.pocketedBalls || [],
            scoredBallIds: resolve.scoredBallIds,
            scoreGained: resolve.scoreGained,
            switchTurn: resolve.switchTurn,
            switchTeam: resolve.switchTeam,
            switchToTeammate: resolve.switchToTeammate,
          },
          balls: networkSync.createBallDiff(s.balls, s.balls),
        });
      }
    },

    aiTakeTurn: () => {
      const s = get();
      if (!networkSync.shouldRunPhysics()) return;

      const currentPlayer = s.players.find((p) => p.id === s.currentPlayerId);
      if (!currentPlayer?.isAI) return;

      const decision = decideAIShot(
        s.mode,
        s.balls,
        currentPlayer,
        s.groupsAssigned,
        currentPlayer.aiDifficulty || 'easy',
      );

      set({ aimAngle: decision.aimAngle });
      get().startCharge();

      setTimeout(() => {
        set({ power: decision.power });
        get().releaseShot();
      }, 600);
    },

    tickAITimer: () => {
      return true;
    },

    setShowAimLine: (v) => set({ showAimLine: v }),
    setSelectedGameMode: (m) => set({ selectedGameMode: m }),
    setSelectedPlayMode: (m) => set({ selectedPlayMode: m }),
    setSelectedAIDifficulty: (d) => set({ selectedAIDifficulty: d }),
    setSelectedCoopSubMode: (s) => set({ selectedCoopSubMode: s }),
    setMenuTab: (t) => set({ menuTab: t }),
    setReplayId: (id) => set({ replayId: id, replayProgress: 0, replayPlaying: false }),
    setReplayProgress: (p) => set({ replayProgress: p }),
    setReplayPlaying: (p) => set({ replayPlaying: p }),
    setReplaySpeed: (sp) => set({ replaySpeed: sp }),
    setPhase: (p) => set({ phase: p }),
    setBalls: (balls) => set({ balls }),
    setTeams: (teams) => set({ teams }),
    setShowCoopLobby: (v) => set({ showCoopLobby: v }),

    applyRemoteShot: (aimAngle, power, playerId) => {
      const s = get();
      if (s.currentPlayerId !== playerId) return;
      if (!networkSync.shouldRunPhysics()) return;

      const shot: Shot = {
        aimAngle,
        power,
        playerId,
        timestamp: Date.now(),
        hits: [],
        pocketedBalls: [],
        foul: FoulTypeEnum.NONE,
      };
      applyShot(s.balls, aimAngle, power, MAX_POWER);
      recordReplayShot(shot);
      set({ isCharging: false, currentShot: shot, phase: 'simulating', power: 0 });
    },

    applyFullStateSync: (payload) => {
      const s = get();
      const updatedBalls = mergeBallsState(s.balls, payload.balls);

      set({
        balls: updatedBalls,
        players: payload.players,
        teams: payload.teams,
        currentPlayerId: payload.currentPlayerId,
        currentTeamId: payload.currentTeamId,
        phase: payload.phase,
        turnNumber: payload.turnNumber,
        foul: payload.foul,
        foulMessage: payload.foulMessage,
        groupsAssigned: payload.groupsAssigned,
        targetBallHint: payload.targetBallHint,
        freeBall: payload.freeBall,
      });
    },

    applyPartialStateSync: (payload) => {
      const s = get();
      const updates: Partial<GameState> = {};

      if (payload.balls && payload.balls.length > 0) {
        const updatedBalls = mergeBallsState(s.balls, payload.balls);
        updates.balls = updatedBalls;
      }
      if (payload.currentPlayerId !== undefined) updates.currentPlayerId = payload.currentPlayerId;
      if (payload.currentTeamId !== undefined) updates.currentTeamId = payload.currentTeamId;
      if (payload.phase !== undefined) updates.phase = payload.phase;
      if (payload.turnNumber !== undefined) updates.turnNumber = payload.turnNumber;
      if (payload.foul !== undefined) updates.foul = payload.foul;
      if (payload.foulMessage !== undefined) updates.foulMessage = payload.foulMessage;
      if (payload.groupsAssigned !== undefined) updates.groupsAssigned = payload.groupsAssigned;
      if (payload.targetBallHint !== undefined) updates.targetBallHint = payload.targetBallHint;
      if (payload.freeBall !== undefined) updates.freeBall = payload.freeBall;

      set(updates);
    },

    saveReplayToStorage: () => {
      const s = get();
      const replay = generateReplay(s.mode, s.players, s.winner);
      if (!replay) return false;
      saveReplay(replay);
      return true;
    },

    clearFoul: () => set({ foul: FoulTypeEnum.NONE, foulMessage: null }),

    backToMenu: () => {
      stopRecording();
      networkSync.stopSyncLoop();
      networkSync.reset();
      set({
        phase: 'setup',
        balls: [],
        teams: [],
        winner: null,
        replayRecording: false,
        menuTab: 'home',
        replayId: null,
        showCoopLobby: false,
      });
    },
  };
});
