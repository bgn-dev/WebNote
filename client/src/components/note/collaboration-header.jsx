import { BiGroup } from 'react-icons/bi';

/**
 * CollaborationHeader - Shows live collaboration status and connected users
 * Displays user avatars, connection status, and provides access to invite dialog
 */
export default function CollaborationHeader({ 
  connectedPeers, 
  webrtcPeers, 
  connectionStatus, 
  onShowInvite 
}) {
  return (
    <div className="flex items-center space-x-2">
      {/* Live Collaboration Indicator - Notion Style */}
      {connectedPeers.length > 0 ? (
        <div 
          className="flex items-center space-x-1.5 px-2.5 py-1 bg-blue-50/80 backdrop-blur-sm border border-blue-200/60 rounded-lg transition-all duration-300 hover:bg-blue-100/80"
          title={`${connectedPeers.length + 1} people in this note\n${connectedPeers.map(p => `• ${p.username}${webrtcPeers.find(wp => wp.sid === p.sid) ? ' ✓' : ' (connecting...)'}`).join('\n')}`}
        >
          <div className="flex -space-x-0.5">
            {connectedPeers.slice(0, 3).map((peer) => (
              <div
                key={peer.sid}
                className={`w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[10px] font-medium text-white transition-all duration-300 ${
                  webrtcPeers.find(wp => wp.sid === peer.sid) 
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20' 
                    : 'bg-gradient-to-br from-amber-400 to-amber-500 shadow-amber-400/20 animate-pulse'
                }`}
                title={`${peer.username} ${webrtcPeers.find(wp => wp.sid === peer.sid) ? '(connected)' : '(connecting...)'}`}
              >
                {peer.username.charAt(0).toUpperCase()}
              </div>
            ))}
            {connectedPeers.length > 3 && (
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 border-2 border-white shadow-sm flex items-center justify-center">
                <span className="text-[10px] font-medium text-white">+{connectedPeers.length - 3}</span>
              </div>
            )}
          </div>
          <span className="text-xs font-medium text-blue-700">
            {connectedPeers.length === 1 ? '1 other' : `${connectedPeers.length} others`}
          </span>
        </div>
      ) : connectionStatus === 'connecting' ? (
        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50/80 backdrop-blur-sm border border-amber-200/60 rounded-lg">
          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-medium text-amber-700">Connecting...</span>
        </div>
      ) : connectionStatus === 'error' ? (
        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-orange-50/80 backdrop-blur-sm border border-orange-200/60 rounded-lg">
          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
          <span className="text-xs font-medium text-orange-700">Offline</span>
        </div>
      ) : (
        <span className="text-xs font-light text-slate-400">Working alone</span>
      )}

      {/* Collaboration Button */}
      <button
        onClick={onShowInvite}
        className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-300"
      >
        <BiGroup className="w-5 h-5" />
      </button>
    </div>
  );
}