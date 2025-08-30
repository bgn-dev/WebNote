import { useParams } from "react-router-dom";
import { useRef, useEffect, useState, useCallback } from "react";
import socketio from "socket.io-client";
import WebRTCManager from "./webrtc-manager";

function CallScreen() {
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

        socketRef.current.on("connect", () => {
            setConnectionStatus("connected");
            
            // Initialize WebRTC manager after socket connection
            webrtcManager.current = new WebRTCManager(
                socketRef.current,
                handleMessage,
                handlePeerConnected,
                handlePeerDisconnected
            );
            
            joinTimeoutRef.current = setTimeout(() => {
                joinRoom();
            }, 100);
        });

        socketRef.current.on("ready", (data) => {
            console.log("Room joined, existing peers:", data.peers);
            setConnectedPeers(data.peers);
            setMessages(prev => [...prev, `Joined room. Found ${data.peers.length} existing peers.`]);
            
            // Set user info in WebRTC manager and connect to existing peers
            if (webrtcManager.current) {
                webrtcManager.current.setUserInfo(localUsername, roomName);
                data.peers.forEach(peer => {
                    webrtcManager.current.addPeer(peer.sid, peer.username);
                });
            }
        });

        socketRef.current.on("new_peer", (data) => {
            console.log("New peer joined:", data);
            setConnectedPeers(prev => [...prev, { sid: data.sid, username: data.username }]);
            setMessages(prev => [...prev, `${data.username} joined the room`]);
            
            // Connect to new peer via WebRTC
            if (webrtcManager.current) {
                webrtcManager.current.addPeer(data.sid, data.username);
            }
        });

        socketRef.current.on("peer_left", (data) => {
            console.log("Peer left:", data);
            setConnectedPeers(prev => prev.filter(peer => peer.sid !== data.sid));
            setMessages(prev => [...prev, `${data.username} left the room`]);
            
            // Remove peer from WebRTC
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

        return () => {
            if (joinTimeoutRef.current) {
                clearTimeout(joinTimeoutRef.current);
            }
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
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

export default CallScreen;