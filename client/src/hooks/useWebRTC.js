import { useState, useEffect, useCallback, useRef } from 'react';
import WebRTCManager from '../screens/webrtc-manager';

// Custom hook for WebRTC management with proper separation of concerns
function useWebRTC() {
    // State management
    const [connectedPeers, setConnectedPeers] = useState([]);
    const [messages, setMessages] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('idle');
    const [error, setError] = useState(null);

    // Refs for stable references
    const webrtcManagerRef = useRef(null);
    const unsubscribeCallbacksRef = useRef([]);

    // Initialize WebRTC manager
    const initializeWebRTC = useCallback((socket, username, room) => {
        try {
            // Clear any existing subscriptions
            unsubscribeCallbacksRef.current.forEach(unsub => unsub());
            unsubscribeCallbacksRef.current = [];

            // Legacy callbacks for backward compatibility
            const legacyOnMessage = (username, message) => {
                console.log('Legacy callback - message received:', username, message);
            };

            const legacyOnPeerConnected = (peerId, username) => {
                console.log('Legacy callback - peer connected:', peerId, username);
                setConnectedPeers(prev => prev.map(peer => 
                    peer.peerId === peerId 
                        ? { ...peer, connected: true }
                        : peer
                ));
            };

            const legacyOnPeerDisconnected = (peerId) => {
                console.log('Legacy callback - peer disconnected:', peerId);
            };

            // Create or get singleton instance
            webrtcManagerRef.current = WebRTCManager.createInstance(
                socket,
                legacyOnMessage,
                legacyOnPeerConnected,
                legacyOnPeerDisconnected
            );

            // Set user info
            webrtcManagerRef.current.setUserInfo(username, room);

            // Set up event listeners for WebRTC events
            const unsubscribeMessageReceived = webrtcManagerRef.current.on('message_received', (event) => {
                const { username, message } = event.detail;
                setMessages(prev => [...prev, `${username}: ${message}`]);
            });

            const unsubscribeConnectionStateChanged = webrtcManagerRef.current.on('connection_state_changed', (event) => {
                const { peerId, newState } = event.detail;
                setConnectionStatus(newState);
                
                // Update peer connection status in existing peers
                setConnectedPeers(prev => prev.map(peer => 
                    peer.peerId === peerId 
                        ? { ...peer, connected: newState === 'connected' }
                        : peer
                ));
            });

            const unsubscribeError = webrtcManagerRef.current.on('error', (event) => {
                const { error } = event.detail;
                setError(error);
                console.error('WebRTC Error:', error);
            });

            // Store unsubscribe functions
            unsubscribeCallbacksRef.current = [
                unsubscribeMessageReceived,
                unsubscribeConnectionStateChanged,
                unsubscribeError
            ];

            // Start with clean state - let socket events populate peers
            setConnectedPeers([]);
            setMessages([]);
            setConnectionStatus('idle');

            setError(null);
            console.log('WebRTC hook initialized successfully');

        } catch (err) {
            console.error('Failed to initialize WebRTC:', err);
            setError(err.message);
        }
    }, []);

    // Add peer (also updates component state)
    const addPeer = useCallback((peerId, username, shouldInitiateOffer = false) => {
        // Add to component state first
        setConnectedPeers(prev => {
            if (prev.find(p => p.peerId === peerId)) return prev;
            return [...prev, { peerId, username, connected: false }]; // Start as connecting
        });
        
        // Then initiate WebRTC connection
        if (webrtcManagerRef.current) {
            webrtcManagerRef.current.addPeer(peerId, username, shouldInitiateOffer);
        }
    }, []);

    // Remove peer (also updates component state)
    const removePeer = useCallback((peerId) => {
        // Remove from component state
        setConnectedPeers(prev => prev.filter(p => p.peerId !== peerId));
        
        // Then remove WebRTC connection
        if (webrtcManagerRef.current) {
            webrtcManagerRef.current.removePeer(peerId);
        }
    }, []);
    
    // Set initial peers (for when joining a room with existing peers)
    const setInitialPeers = useCallback((peers) => {
        setConnectedPeers(peers.map(peer => ({ 
            peerId: peer.sid, 
            username: peer.username, 
            connected: false 
        })));
    }, []);

    // Send message
    const sendMessage = useCallback((message) => {
        if (webrtcManagerRef.current) {
            webrtcManagerRef.current.broadcastMessage(message);
            setMessages(prev => [...prev, `You: ${message}`]);
        }
    }, []);

    // Get connection state for a specific peer
    const getConnectionState = useCallback((peerId) => {
        if (webrtcManagerRef.current) {
            return webrtcManagerRef.current.getConnectionState(peerId);
        }
        return 'idle';
    }, []);

    // Clear messages
    const clearMessages = useCallback(() => {
        setMessages([]);
        if (webrtcManagerRef.current) {
            webrtcManagerRef.current.clearMessages();
        }
    }, []);

    // Cleanup on unmount only (empty dependency array)
    useEffect(() => {
        return () => {
            // Clean up event subscriptions
            unsubscribeCallbacksRef.current.forEach(unsub => unsub());
            unsubscribeCallbacksRef.current = [];
            
            // Cleanup the WebRTC manager
            if (webrtcManagerRef.current) {
                webrtcManagerRef.current.cleanup();
                webrtcManagerRef.current = null;
            }
            
            console.log('WebRTC hook cleanup completed');
        };
    }, []); // Empty dependency array - cleanup only on unmount

    return {
        // State
        connectedPeers,
        messages,
        connectionStatus,
        error,
        
        // Actions
        initializeWebRTC,
        addPeer,
        removePeer,
        setInitialPeers,
        sendMessage,
        clearMessages,
        getConnectionState,
        
        // Direct access to manager (for advanced usage)
        webrtcManager: webrtcManagerRef.current
    };
}

export default useWebRTC;