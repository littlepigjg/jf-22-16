import { useState } from 'react';
import { useNetworkStore } from '../stores/useNetworkStore';
import { Copy, Check, Wifi, WifiOff, Loader2 } from 'lucide-react';

interface CoopLobbyProps {
  onConnected: () => void;
  onCancel: () => void;
}

export default function CoopLobby({ onConnected, onCancel }: CoopLobbyProps) {
  const status = useNetworkStore((s) => s.status);
  const error = useNetworkStore((s) => s.error);
  const isHost = useNetworkStore((s) => s.isHost);
  const offerCode = useNetworkStore((s) => s.offerCode);
  const answerCode = useNetworkStore((s) => s.answerCode);
  const createRoom = useNetworkStore((s) => s.createRoom);
  const joinRoom = useNetworkStore((s) => s.joinRoom);
  const acceptAnswer = useNetworkStore((s) => s.acceptAnswer);
  const disconnect = useNetworkStore((s) => s.disconnect);

  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [copiedOffer, setCopiedOffer] = useState(false);
  const [copiedAnswer, setCopiedAnswer] = useState(false);

  if (status === 'connected') {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-emerald-900/50 via-emerald-950/70 to-zinc-900/50 backdrop-blur-xl border border-emerald-600/40 p-8 shadow-2xl text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <Wifi className="w-8 h-8 text-emerald-400" />
        </div>
        <div className="text-2xl font-serif font-black text-emerald-300 mb-2">连接成功！</div>
        <div className="text-zinc-400 text-sm mb-4">
          {isHost ? '你是主机（玩家1）' : '你是客机（玩家2）'}
        </div>
        <button
          onClick={onConnected}
          className="px-8 py-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-zinc-900 font-bold transition-all shadow-lg hover:scale-105 active:scale-95"
        >
          开始游戏
        </button>
      </div>
    );
  }

  const handleCreateRoom = async () => {
    setRole('host');
    await createRoom();
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setRole('guest');
    await joinRoom(joinCode.trim());
  };

  const handleAcceptAnswer = async () => {
    if (!answerInput.trim()) return;
    await acceptAnswer(answerInput.trim());
  };

  const handleCancel = () => {
    disconnect();
    setRole(null);
    setJoinCode('');
    setAnswerInput('');
    onCancel();
  };

  const copyToClipboard = async (text: string, type: 'offer' | 'answer') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'offer') {
        setCopiedOffer(true);
        setTimeout(() => setCopiedOffer(false), 2000);
      } else {
        setCopiedAnswer(true);
        setTimeout(() => setCopiedAnswer(false), 2000);
      }
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  if (!role) {
    return (
      <div className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-zinc-700/50 p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
            <Wifi className="w-6 h-6 text-amber-400" />
          </div>
          <div className="text-xl font-serif font-bold text-zinc-100 mb-1">在线协作</div>
          <div className="text-zinc-400 text-sm">选择你的角色来建立连接</div>
        </div>

        <div className="space-y-3 mb-4">
          <button
            onClick={handleCreateRoom}
            disabled={status === 'connecting'}
            className="w-full p-4 rounded-xl border-2 border-amber-500/40 bg-amber-900/20 hover:bg-amber-900/40 text-left transition-all disabled:opacity-50"
          >
            <div className="font-bold text-amber-200">创建房间</div>
            <div className="text-xs text-amber-200/60 mt-1">你是玩家1，生成邀请码给对方</div>
          </button>

          <button
            onClick={() => setRole('guest')}
            disabled={status === 'connecting'}
            className="w-full p-4 rounded-xl border-2 border-emerald-500/40 bg-emerald-900/20 hover:bg-emerald-900/40 text-left transition-all disabled:opacity-50"
          >
            <div className="font-bold text-emerald-200">加入房间</div>
            <div className="text-xs text-emerald-200/60 mt-1">你是玩家2，输入对方的邀请码</div>
          </button>
        </div>

        <button
          onClick={handleCancel}
          className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
        >
          取消
        </button>
      </div>
    );
  }

  if (role === 'host') {
    return (
      <div className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-amber-600/30 p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            {status === 'connecting' ? (
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            ) : (
              <Wifi className="w-5 h-5 text-amber-400" />
            )}
            <span className="text-lg font-bold text-amber-300">你是主机（玩家1）</span>
          </div>
          <div className="text-zinc-400 text-sm">将以下邀请码发给你的队友</div>
        </div>

        {offerCode && (
          <div className="mb-4">
            <label className="text-xs text-zinc-500 uppercase tracking-wider font-bold">邀请码</label>
            <div className="mt-1 flex gap-2">
              <input
                readOnly
                value={offerCode}
                className="flex-1 p-3 rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs font-mono"
              />
              <button
                onClick={() => copyToClipboard(offerCode, 'offer')}
                className="px-3 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 transition-colors"
              >
                {copiedOffer ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-amber-300" />}
              </button>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs text-zinc-500 uppercase tracking-wider font-bold">对方回传码</label>
          <div className="mt-1 flex gap-2">
            <input
              value={answerInput}
              onChange={(e) => setAnswerInput(e.target.value)}
              placeholder="粘贴队友的回传码..."
              className="flex-1 p-3 rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs font-mono placeholder-zinc-600"
            />
            <button
              onClick={handleAcceptAnswer}
              disabled={!answerInput.trim()}
              className="px-4 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 text-sm font-semibold transition-colors disabled:opacity-30"
            >
              连接
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-900/30 border border-rose-500/40 text-rose-300 text-sm mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleCancel}
          className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
        >
          取消
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-emerald-600/30 p-8 shadow-2xl">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          {status === 'connecting' ? (
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
          ) : (
            <WifiOff className="w-5 h-5 text-emerald-400" />
          )}
          <span className="text-lg font-bold text-emerald-300">加入房间（玩家2）</span>
        </div>
        <div className="text-zinc-400 text-sm">输入主机发来的邀请码</div>
      </div>

      {!answerCode ? (
        <div className="mb-4">
          <label className="text-xs text-zinc-500 uppercase tracking-wider font-bold">邀请码</label>
          <div className="mt-1 flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="粘贴主机的邀请码..."
              className="flex-1 p-3 rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs font-mono placeholder-zinc-600"
            />
            <button
              onClick={handleJoin}
              disabled={!joinCode.trim()}
              className="px-4 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 text-sm font-semibold transition-colors disabled:opacity-30"
            >
              加入
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <label className="text-xs text-zinc-500 uppercase tracking-wider font-bold">回传码（发给主机）</label>
          <div className="mt-1 flex gap-2">
            <input
              readOnly
              value={answerCode}
              className="flex-1 p-3 rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs font-mono"
            />
            <button
              onClick={() => copyToClipboard(answerCode, 'answer')}
              className="px-3 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 transition-colors"
            >
              {copiedAnswer ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-emerald-300" />}
            </button>
          </div>
          <div className="text-zinc-500 text-xs mt-2">将此码复制发给主机，等待对方连接</div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-rose-900/30 border border-rose-500/40 text-rose-300 text-sm mb-4">
          {error}
        </div>
      )}

      <button
        onClick={handleCancel}
        className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
      >
        取消
      </button>
    </div>
  );
}
