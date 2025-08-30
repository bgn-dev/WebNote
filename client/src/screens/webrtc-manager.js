class WebRTCManager {
    constructor(socket, onMessage, onPeerConnected, onPeerDisconnected) {
        this.socket = socket;
        this.onMessage = onMessage;
        this.onPeerConnected = onPeerConnected;
        this.onPeerDisconnected = onPeerDisconnected;
        
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.localUsername = "";
        this.roomName = "";
        
        this.setupSocketListeners();
    }

    setUserInfo(username, room) {
        this.localUsername = username;
        this.roomName = room;
    }

    setupSocketListeners() {
        this.socket.on("data", (data) => {
            this.handleSignalingData(data);
        });
    }

    async addPeer(peerId, username) {
        console.log(`Adding peer: ${username} (${peerId})`);
        await this.createPeerConnection(peerId, username);
    }

    async createPeerConnection(peerId, username) {
        try {
            const peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
                    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
                ]
            });

            this.peerConnections.set(peerId, peerConnection);
            console.log(`Created RTCPeerConnection for ${username}`);

            // Create data channel
            const dataChannel = peerConnection.createDataChannel("messages", {
                ordered: true
            });
            console.log(`Created data channel for ${username}`);
            
            this.dataChannels.set(peerId, dataChannel);
            this.setupDataChannel(dataChannel, peerId, username);

            // Handle incoming data channels
            peerConnection.ondatachannel = (event) => {
                console.log(`Incoming data channel from ${username}`);
                const channel = event.channel;
                this.dataChannels.set(peerId, channel);
                this.setupDataChannel(channel, peerId, username);
            };

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log(`Sending ICE candidate to ${username}`);
                    this.sendSignalingData(peerId, {
                        type: "ice-candidate",
                        candidate: event.candidate
                    });
                }
            };

            // Create and send offer
            console.log(`Creating offer for ${username}`);
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            this.sendSignalingData(peerId, {
                type: "offer",
                offer: offer
            });
            console.log(`Sent offer to ${username}`);
            
        } catch (error) {
            console.error(`Error creating peer connection for ${username}:`, error);
            this.onPeerDisconnected(peerId);
            throw error;
        }
    }

    async createPeerConnectionForIncomingOffer(peerId, username) {
        try {
            const peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
                    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
                ]
            });

            this.peerConnections.set(peerId, peerConnection);
            console.log(`Created RTCPeerConnection for incoming offer from ${username}`);

            // Handle incoming data channels (don't create one ourselves)
            peerConnection.ondatachannel = (event) => {
                console.log(`Incoming data channel from ${username}`);
                const channel = event.channel;
                this.dataChannels.set(peerId, channel);
                this.setupDataChannel(channel, peerId, username);
            };

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log(`Sending ICE candidate to ${username}`);
                    this.sendSignalingData(peerId, {
                        type: "ice-candidate",
                        candidate: event.candidate
                    });
                }
            };

            return peerConnection;
            
        } catch (error) {
            console.error(`Error creating peer connection for incoming offer from ${username}:`, error);
            throw error;
        }
    }

    async removePeer(peerId) {
        console.log(`Removing peer connection for ${peerId}`);
        
        try {
            if (this.peerConnections.has(peerId)) {
                const pc = this.peerConnections.get(peerId);
                pc.close();
                this.peerConnections.delete(peerId);
            }
            if (this.dataChannels.has(peerId)) {
                const channel = this.dataChannels.get(peerId);
                if (channel.readyState === 'open') {
                    channel.close();
                }
                this.dataChannels.delete(peerId);
            }
        } catch (error) {
            console.error(`Error removing peer ${peerId}:`, error);
        } finally {
            this.onPeerDisconnected(peerId);
        }
    }

    setupDataChannel(dataChannel, peerId, username) {
        dataChannel.onopen = () => {
            console.log(`Data channel opened with ${username}`);
            this.onPeerConnected(peerId, username);
        };

        dataChannel.onmessage = (event) => {
            this.onMessage(username, event.data);
        };

        dataChannel.onclose = () => {
            console.log(`Data channel closed with ${username}`);
            this.onPeerDisconnected(peerId);
        };
    }

    async handleSignalingData(data) {
        console.log("Received signaling data:", data);
        const { username, room, senderId, data: signalingData } = data;
        
        if (room !== this.roomName) return;

        let peerConnection = this.peerConnections.get(senderId);
        
        if (!peerConnection) {
            console.log(`No peer connection found for signaling data from ${username} (${senderId})`);
            return;
        }

        try {
            switch (signalingData.type) {
                case "offer":
                    console.log(`Received offer from ${username}, signaling state: ${peerConnection.signalingState}`);
                    
                    // If we're in have-local-offer state and receive an offer, we have a collision
                    if (peerConnection.signalingState === "have-local-offer") {
                        console.log(`Offer collision detected with ${username}`);
                        
                        // Use deterministic tie-breaking: lower username wins (becomes polite peer)
                        const isPolite = this.localUsername < username;
                        console.log(`Collision resolution: ${this.localUsername} ${isPolite ? 'is polite' : 'is impolite'} vs ${username}`);
                        
                        if (isPolite) {
                            // We are polite - we yield and accept their offer
                            console.log(`Being polite: accepting offer from ${username}, discarding our offer`);
                            await peerConnection.setLocalDescription({ type: "rollback" });
                        } else {
                            // We are impolite - ignore their offer and keep ours
                            console.log(`Being impolite: ignoring offer from ${username}, keeping our offer`);
                            return;
                        }
                    }
                    
                    // Only process offer if connection is in stable state
                    if (peerConnection.signalingState === "stable") {
                        console.log(`Setting remote description and creating answer for ${username}`);
                        await peerConnection.setRemoteDescription(signalingData.offer);
                        
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        
                        this.sendSignalingData(senderId, {
                            type: "answer",
                            answer: answer
                        });
                        console.log(`Sent answer to ${username}`);
                    } else {
                        console.log(`Ignoring offer from ${username}, connection not in stable state: ${peerConnection.signalingState}`);
                    }
                    break;

                case "answer":
                    console.log(`Received answer from ${username}, signaling state: ${peerConnection.signalingState}`);
                    // Only process answer if we're waiting for one
                    if (peerConnection.signalingState === "have-local-offer") {
                        console.log(`Setting remote description from answer by ${username}`);
                        await peerConnection.setRemoteDescription(signalingData.answer);
                    } else {
                        console.log(`Ignoring answer from ${username}, not in have-local-offer state: ${peerConnection.signalingState}`);
                    }
                    break;

                case "ice-candidate":
                    console.log(`Adding ICE candidate from ${username}`);
                    // Only add ICE candidates if remote description is set
                    if (peerConnection.remoteDescription && signalingData.candidate && signalingData.candidate.candidate) {
                        await peerConnection.addIceCandidate(signalingData.candidate);
                    } else if (!peerConnection.remoteDescription) {
                        console.log(`Ignoring ICE candidate from ${username}, no remote description set yet`);
                    }
                    break;
            }
        } catch (error) {
            console.error(`Error handling signaling data from ${username}:`, error);
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
                data: data
            });
        } catch (error) {
            console.error('Failed to send signaling data:', error);
        }
    }

    broadcastMessage(message) {
        const promises = [];
        this.dataChannels.forEach((channel, peerId) => {
            if (channel.readyState === "open") {
                try {
                    channel.send(message);
                } catch (error) {
                    console.error(`Failed to send message to peer ${peerId}:`, error);
                    promises.push(this.removePeer(peerId));
                }
            }
        });
        
        if (promises.length > 0) {
            Promise.allSettled(promises).catch(error => {
                console.error('Error cleaning up failed peers:', error);
            });
        }
    }

    cleanup() {
        console.log('Cleaning up WebRTC manager');
        
        // Close all peer connections
        for (const [peerId, pc] of this.peerConnections) {
            try {
                pc.close();
            } catch (error) {
                console.error(`Error closing peer connection ${peerId}:`, error);
            }
        }
        
        // Close all data channels
        for (const [peerId, channel] of this.dataChannels) {
            try {
                if (channel.readyState === 'open') {
                    channel.close();
                }
            } catch (error) {
                console.error(`Error closing data channel ${peerId}:`, error);
            }
        }
        
        // Clear collections
        this.peerConnections.clear();
        this.dataChannels.clear();
        
        // Remove socket listeners
        if (this.socket) {
            this.socket.off('data');
        }
    }

}

export default WebRTCManager;