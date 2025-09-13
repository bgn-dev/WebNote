class WebRTCManager {
    static instance = null;

    constructor(socket, onMessage, onPeerConnected, onPeerDisconnected) {
        if (!socket || !onMessage || !onPeerConnected || !onPeerDisconnected) {
            throw new Error('All callback parameters are required');
        }
        
        this.socket = socket;
        this.onMessage = onMessage;
        this.onPeerConnected = onPeerConnected;
        this.onPeerDisconnected = onPeerDisconnected;
        
        this.localPeerId = socket.id;
        this.localUsername = "";
        this.roomName = "";
        
        // Single state container per peer
        this.peers = new Map(); // peerId -> { pc, channel, username, iceCandidates }
        
        this.setupSocketListeners();
    }

    static getInstance() {
        return WebRTCManager.instance;
    }

    static createInstance(socket, onMessage, onPeerConnected, onPeerDisconnected) {
        if (WebRTCManager.instance) {
            WebRTCManager.instance.cleanup();
        }
        const instance = new WebRTCManager(socket, onMessage, onPeerConnected, onPeerDisconnected);
        instance.localPeerId = socket.id;
        WebRTCManager.instance = instance;
        return WebRTCManager.instance;
    }

    setUserInfo(username, room) {
        this.localUsername = username;
        this.roomName = room;
        if (this.socket) {
            this.localPeerId = this.socket.id;
        }
    }

    shouldInitiateConnection(remotePeerId) {
        const shouldInitiate = this.localPeerId < remotePeerId;
        console.log(`Deterministic check: "${this.localPeerId}" < "${remotePeerId}" = ${shouldInitiate}`);
        return shouldInitiate;
    }

    hasPeer(peerId) {
        return this.peers.has(peerId);
    }

    setupSocketListeners() {
        this.socket.on("data", (data) => {
            this.handleSignalingData(data);
        });
    }

    async addPeer(peerId, username) {
        if (this.hasPeer(peerId) || peerId === this.localPeerId) {
            console.log(`Skipping peer ${username} - already exists or is self`);
            return;
        }

        const shouldInitiate = this.shouldInitiateConnection(peerId);
        console.log(`Adding peer: ${username} (${peerId}), should initiate: ${shouldInitiate}`);
        
        try {
            await this.createPeerConnection(peerId, username, shouldInitiate);
            console.log(`Successfully created connection for ${username}`);
        } catch (error) {
            console.error(`Failed to add peer ${username}:`, error);
        }
    }

    async createPeerConnection(peerId, username, shouldInitiateOffer = true) {
        try {
            const peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" },
                    { 
                        urls: 'turn:openrelay.metered.ca:80',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
                ]
            });

            // Initialize peer state
            const peer = {
                pc: peerConnection,
                channel: null,
                username,
                iceCandidates: []
            };
            this.peers.set(peerId, peer);

            // Handle connection state changes
            peerConnection.onconnectionstatechange = () => {
                if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
                    this.removePeer(peerId);
                }
            };

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignalingData(peerId, {
                        type: "ice-candidate",
                        candidate: event.candidate
                    });
                }
            };

            // Create offer if we should initiate
            if (shouldInitiateOffer) {
                console.log(`Creating offer for ${username}`);
                const dataChannel = peerConnection.createDataChannel("messages", {
                    ordered: true
                });
                
                peer.channel = dataChannel;
                this.setupDataChannel(dataChannel, peerId, username);
                
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                this.sendSignalingData(peerId, { type: "offer", offer });
                console.log(`Sent offer to ${username}`);
            } else {
                console.log(`Waiting for offer from ${username}`);
            }

            // Handle incoming data channels (for responders)
            peerConnection.ondatachannel = (event) => {
                const channel = event.channel;
                peer.channel = channel;
                this.setupDataChannel(channel, peerId, username);
            };
            
        } catch (error) {
            console.error(`Error creating peer connection for ${username}:`, error);
            this.onPeerDisconnected(peerId);
            throw error;
        }
    }

    setupDataChannel(dataChannel, peerId, username) {
        dataChannel.onopen = () => {
            this.onPeerConnected(peerId, username);
        };

        dataChannel.onmessage = (event) => {
            this.onMessage(username, event.data);
        };

        dataChannel.onclose = () => {
            this.removePeer(peerId);
        };

        dataChannel.onerror = (error) => {
            console.error(`Data channel error for ${username}:`, error);
            this.removePeer(peerId);
        };
    }

    async handleSignalingData(data) {
        const { username, room, senderId, data: signalingData } = data;
        
        if (room !== this.roomName) return;

        let peer = this.peers.get(senderId);
        
        // Create peer connection on-demand for offers from unknown peers
        if (!peer && signalingData.type === 'offer') {
            await this.createPeerConnection(senderId, username, false);
            peer = this.peers.get(senderId);
        }
        
        if (!peer) return;

        const peerConnection = peer.pc;

        try {
            console.log(`Processing ${signalingData.type} from ${username}`);
            switch (signalingData.type) {
                case "offer":
                    // Handle glare condition (both peers sent offers)
                    if (peerConnection.signalingState === "have-local-offer") {
                        const shouldKeepMyOffer = this.shouldInitiateConnection(senderId);
                        if (shouldKeepMyOffer) {
                            return; // Ignore the incoming offer
                        } else {
                            // Accept their offer, rollback mine
                            await peerConnection.setLocalDescription({type: 'rollback'});
                        }
                    }
                    
                    if (peerConnection.signalingState === "stable") {
                        await peerConnection.setRemoteDescription(signalingData.offer);
                        
                        // Process queued ICE candidates
                        for (const candidate of peer.iceCandidates) {
                            try {
                                await peerConnection.addIceCandidate(candidate);
                            } catch (error) {
                                // Ignore "Unknown ufrag" errors - these are normal during connection teardown/restart
                                if (!error.message.includes('Unknown ufrag')) {
                                    console.warn(`Queued ICE candidate error from ${username}:`, error.message);
                                }
                            }
                        }
                        peer.iceCandidates = [];
                        
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        this.sendSignalingData(senderId, { type: "answer", answer });
                    }
                    break;

                case "answer":
                    if (peerConnection.signalingState === "have-local-offer") {
                        await peerConnection.setRemoteDescription(signalingData.answer);
                        
                        // Process queued ICE candidates
                        for (const candidate of peer.iceCandidates) {
                            try {
                                await peerConnection.addIceCandidate(candidate);
                            } catch (error) {
                                // Ignore "Unknown ufrag" errors - these are normal during connection teardown/restart
                                if (!error.message.includes('Unknown ufrag')) {
                                    console.warn(`Queued ICE candidate error from ${username}:`, error.message);
                                }
                            }
                        }
                        peer.iceCandidates = [];
                    }
                    break;

                case "ice-candidate":
                    try {
                        if (peerConnection.remoteDescription) {
                            await peerConnection.addIceCandidate(signalingData.candidate);
                        } else {
                            // Queue candidate until remote description is set
                            peer.iceCandidates.push(signalingData.candidate);
                        }
                    } catch (error) {
                        // Ignore "Unknown ufrag" errors - these are normal during connection teardown/restart
                        if (!error.message.includes('Unknown ufrag')) {
                            console.warn(`ICE candidate error from ${username}:`, error.message);
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error(`Error handling signaling from ${username}:`, error);
        }
    }

    sendSignalingData(peerId, data) {
        if (!this.socket || !this.socket.connected) {
            console.error('Cannot send signaling data: socket not connected');
            return;
        }
        
        try {
            this.socket.emit("data", {
                username: this.localUsername,
                room: this.roomName,
                targetPeerId: peerId,
                data: data
            });
        } catch (error) {
            console.error('Failed to send signaling data:', error);
        }
    }

    broadcastMessage(message) {
        if (!message || typeof message !== 'string') return;
        
        const failedPeers = [];
        this.peers.forEach((peer, peerId) => {
            if (peer.channel && peer.channel.readyState === "open") {
                try {
                    peer.channel.send(message);
                } catch (error) {
                    console.error(`Failed to send message to peer ${peerId}:`, error);
                    failedPeers.push(peerId);
                }
            }
        });
        
        // Clean up failed peers
        failedPeers.forEach(peerId => this.removePeer(peerId));
    }

    removePeer(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer) return;
        
        try {
            // Clear event handlers to prevent callbacks during cleanup
            if (peer.pc) {
                peer.pc.onconnectionstatechange = null;
                peer.pc.onicecandidate = null;
                peer.pc.ondatachannel = null;
                peer.pc.close();
            }
            if (peer.channel) {
                peer.channel.onopen = null;
                peer.channel.onmessage = null;
                peer.channel.onclose = null;
                peer.channel.onerror = null;
                if (typeof peer.channel.close === 'function') {
                    peer.channel.close();
                }
            }
            
            this.peers.delete(peerId);
        } catch (error) {
            console.error(`Error removing peer ${peerId}:`, error);
        } finally {
            this.onPeerDisconnected(peerId);
        }
    }

    cleanup() {
        this.peers.forEach((peer, peerId) => {
            try {
                // Clear event handlers to prevent callbacks during cleanup
                if (peer.pc) {
                    peer.pc.onconnectionstatechange = null;
                    peer.pc.onicecandidate = null;
                    peer.pc.ondatachannel = null;
                    peer.pc.close();
                }
                if (peer.channel) {
                    peer.channel.onopen = null;
                    peer.channel.onmessage = null;
                    peer.channel.onclose = null;
                    peer.channel.onerror = null;
                    if (typeof peer.channel.close === 'function') {
                        peer.channel.close();
                    }
                }
            } catch (error) {
                console.error(`Error cleaning up peer ${peerId}:`, error);
            }
        });
        
        this.peers.clear();
        
        if (this.socket) {
            this.socket.off('data');
        }

        WebRTCManager.instance = null;
    }
}

export default WebRTCManager;