import { useParams } from "react-router-dom";
import { useRef, useEffect, useState, useCallback } from "react";
import socketio from "socket.io-client";
import WebRTCManager from "./webrtc-manager";

function Call() {
    const params = useParams();
    const localUsername = params.username;
    const roomName = params.room;

    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");
    const [connectedPeers, setConnectedPeers] = useState([]);
    const [webrtcPeers, setWebrtcPeers] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState("connecting");

    const socketRef = useRef(null);
    const webrtcManager = useRef(null);
    const joinTimeoutRef = useRef(null);

    // Memoized callbacks to prevent recreating WebRTC manager
    const handleMessage = useCallback((username, message) => {
        setMessages(prev => [...prev, `${username}: ${message}`]);
    }, []);

    const handlePeerConnected = useCallback((peerId, username) => {
        setWebrtcPeers(prev => [...prev, { sid: peerId, username, connected: true }]);
        setMessages(prev => [...prev, `WebRTC connected to ${username}`]);
    }, []);

    const handlePeerDisconnected = useCallback((peerId) => {
        setWebrtcPeers(prev => prev.filter(peer => peer.sid !== peerId));
    }, []);

    const joinRoom = useCallback(() => {
        if (socketRef.current && localUsername && roomName) {
            socketRef.current.emit("join", {
                username: localUsername,
                room: roomName
            });
        }
    }, [localUsername, roomName]);

    useEffect(() => {
        socketRef.current = socketio("http://127.0.0.1:9000", {
            transports: ['polling']
        });

        // Handle page refresh/close - cleanup WebRTC connections
        const handleBeforeUnload = (event) => {
            console.log('Page unloading, cleaning up WebRTC connections');
            if (webrtcManager.current) {
                webrtcManager.current.cleanup();
            }
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };

        // Handle visibility change (tab switching, minimizing)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                console.log('Page hidden, keeping connections alive');
                // Don't cleanup connections on hide - just log
            } else {
                console.log('Page visible again');
                // When page becomes visible, check connection health
                if (webrtcManager.current) {
                    console.log(`Checking connections: ${webrtcManager.current.peers.size} active`);
                }
            }
        };

        // Add event listeners for cleanup
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('unload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        socketRef.current.on("connect", () => {
            console.log("Socket connected");
            setConnectionStatus("connected");
            
            webrtcManager.current = WebRTCManager.createInstance(
                socketRef.current,
                handleMessage,
                handlePeerConnected,
                handlePeerDisconnected
            );
            
            joinRoom();
        });

        socketRef.current.on("ready", (data) => {
            console.log("Room joined, existing peers:", data.peers);
            setConnectedPeers(data.peers);
            setMessages(prev => [...prev, `Joined room. Found ${data.peers.length} existing peers.`]);
            
            if (webrtcManager.current) {
                webrtcManager.current.setUserInfo(localUsername, roomName);
                
                // Connect to existing peers immediately - deterministic logic prevents conflicts
                data.peers.forEach((peer) => {
                    if (webrtcManager.current && !webrtcManager.current.hasPeer(peer.sid)) {
                        webrtcManager.current.addPeer(peer.sid, peer.username);
                    }
                });
            }
        });

        socketRef.current.on("new_peer", (data) => {
            console.log("New peer joined:", data);
            setConnectedPeers(prev => [...prev, { sid: data.sid, username: data.username }]);
            setMessages(prev => [...prev, `${data.username} joined the room`]);
            
            if (webrtcManager.current) {
                webrtcManager.current.addPeer(data.sid, data.username);
            }
        });

        socketRef.current.on("peer_left", (data) => {
            console.log("Peer left:", data);
            setConnectedPeers(prev => prev.filter(peer => peer.sid !== data.sid));
            setMessages(prev => [...prev, `${data.username} left the room`]);
            
            if (webrtcManager.current) {
                webrtcManager.current.removePeer(data.sid);
            }
        });

        socketRef.current.on("error", (data) => {
            console.error("Signaling server error:", data.message);
            setMessages(prev => [...prev, `Error: ${data.message}`]);
        });

        socketRef.current.on("connect_error", (error) => {
            console.error("Connection error:", error);
            setConnectionStatus("error");
        });

        socketRef.current.on("disconnect", (reason) => {
            console.log("Socket disconnected:", reason);
            setConnectionStatus("disconnected");
            // Don't cleanup WebRTC connections on disconnect - they can survive reconnection
        });

        return () => {
            console.log('CallScreen component unmounting, cleaning up');
            
            // Clear timeout
            if (joinTimeoutRef.current) {
                clearTimeout(joinTimeoutRef.current);
            }
            
            // Cleanup WebRTC manager
            if (webrtcManager.current) {
                webrtcManager.current.cleanup();
                webrtcManager.current = null;
            }
            
            // Disconnect socket
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            
            // Remove event listeners
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('unload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [joinRoom, handleMessage, handlePeerConnected, handlePeerDisconnected]);

    const sendMessage = useCallback(() => {
        if (inputMessage.trim()) {
            if (webrtcManager.current) {
                webrtcManager.current.broadcastMessage(inputMessage);
            }
            setMessages(prev => [...prev, `You: ${inputMessage}`]);
            setInputMessage("");
        }
    }, [inputMessage]);

    const handleKeyPress = useCallback((event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    }, [sendMessage]);



    return (
        <div style={{ padding: "20px" }}>
            <h2>WebNote Room: {roomName}</h2>
            <p><strong>User:</strong> {localUsername}</p>
            
            <div style={{ marginBottom: "20px" }}>
                <h3>Connected Peers:</h3>
                <div style={{ padding: "10px", backgroundColor: "#f5f5f5", minHeight: "40px" }}>
                    <div><strong>Status:</strong> {connectionStatus}</div>
                    <div><strong>Room Members:</strong> {connectedPeers.length}</div>
                    {connectedPeers.map(peer => (
                        <div key={peer.sid} style={{ marginLeft: "10px" }}>
                            • {peer.username} 
                            <span style={{ color: webrtcPeers.find(p => p.sid === peer.sid) ? "green" : "orange" }}>
                                {webrtcPeers.find(p => p.sid === peer.sid) ? " (WebRTC ✓)" : " (connecting...)"}
                            </span>
                        </div>
                    ))}
                    {connectedPeers.length === 0 && "No peers connected yet"}
                </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
                <h3>Messages:</h3>
                <div style={{ 
                    border: "1px solid #ccc", 
                    padding: "10px", 
                    height: "300px", 
                    overflowY: "auto",
                    backgroundColor: "white"
                }}>
                    {messages.map((msg, index) => (
                        <div key={index} style={{ marginBottom: "5px" }}>{msg}</div>
                    ))}
                </div>
            </div>

            <div>
                <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    style={{ padding: "8px", width: "300px", marginRight: "10px" }}
                />
                <button 
                    onClick={sendMessage}
                    style={{ 
                        padding: "8px 15px", 
                        backgroundColor: "#007bff",
                        color: "white",
                        border: "none",
                        cursor: "pointer"
                    }}
                >
                    Send
                </button>
            </div>
        </div>
    );
}

export default Call;