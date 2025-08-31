class WebRTCManager {
    static instance = null;

    constructor(socket, onMessage, onPeerConnected, onPeerDisconnected) {
        if (!socket || !onMessage || !onPeerConnected || !onPeerDisconnected) {
            throw new Error('All callback parameters are required');
        }
        
        console.log(`WebRTCManager constructor: socket.id = ${socket.id}, socket.connected = ${socket.connected}`);
        
        this.socket = socket;
        this.onMessage = onMessage;
        this.onPeerConnected = onPeerConnected;
        this.onPeerDisconnected = onPeerDisconnected;
        
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.localUsername = "";
        this.roomName = "";
        this.localPeerId = "";
        this.messages = [];
        this.eventListeners = new Map();
        this.iceCandidateQueues = new Map();
        this.connectionAttempts = new Map();
        this.iceCandidateQueues = new Map();
        
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

    initialize(socket, username, room, onMessage, onPeerConnected, onPeerDisconnected) {
        this.socket = socket;
        this.localUsername = username;
        this.roomName = room;
        this.localPeerId = socket.id; // Use socket ID as peer ID
        this.onMessage = onMessage;
        this.onPeerConnected = onPeerConnected;
        this.onPeerDisconnected = onPeerDisconnected;
        this.setupSocketListeners();
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
        console.log(`Connection decision: ${this.localPeerId} ${shouldInitiate ? 'WILL INITIATE to' : 'WILL WAIT for'} ${remotePeerId}`);
        return shouldInitiate;
    }

    hasPeer(peerId) {
        return this.peerConnections.has(peerId);
    }

    getPeerConnectionState(peerId) {
        const pc = this.peerConnections.get(peerId);
        return pc ? pc.connectionState : null;
    }

    on(eventName, callback) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName).push(callback);
        
        return () => {
            const listeners = this.eventListeners.get(eventName);
            if (listeners) {
                const index = listeners.indexOf(callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        };
    }

    emit(eventName, data) {
        const listeners = this.eventListeners.get(eventName);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback({ detail: data });
                } catch (error) {
                    console.error(`Error in event listener for ${eventName}:`, error);
                }
            });
        }
    }

    getConnectionState(peerId) {
        const pc = this.peerConnections.get(peerId);
        return pc ? pc.connectionState : 'idle';
    }

    clearMessages() {
        this.messages = [];
    }


    async handleIceCandidate(peerId, username, candidate) {
        const peerConnection = this.peerConnections.get(peerId);
        if (!peerConnection || !candidate) return;

        // Skip if connection is closed or failed
        if (peerConnection.connectionState === 'closed' || peerConnection.connectionState === 'failed') {
            console.log(`Ignoring ICE candidate from ${username} - connection ${peerConnection.connectionState}`);
            return;
        }

        try {
            if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                console.log(`Adding ICE candidate from ${username}`);
                await peerConnection.addIceCandidate(candidate);
            } else {
                console.log(`Queuing ICE candidate from ${username} (no remote description)`);
                const queue = this.iceCandidateQueues.get(peerId) || [];
                queue.push(candidate);
                this.iceCandidateQueues.set(peerId, queue);
            }
        } catch (error) {
            // Don't log "Unknown ufrag" errors - they're normal when connections are being torn down
            if (error.message.includes('Unknown ufrag')) {
                console.log(`ICE candidate from ${username} for old connection (${error.message.split(' ')[2]}) - ignoring`);
            } else {
                console.warn(`Failed to add ICE candidate from ${username}:`, error.message);
            }
        }
    }

    async processQueuedIceCandidates(peerId, username) {
        const queue = this.iceCandidateQueues.get(peerId);
        const peerConnection = this.peerConnections.get(peerId);
        
        if (!queue || !peerConnection || queue.length === 0) return;

        console.log(`Processing ${queue.length} queued ICE candidates from ${username}`);
        for (const candidate of queue) {
            try {
                await peerConnection.addIceCandidate(candidate);
            } catch (error) {
                console.error(`Error adding queued ICE candidate from ${username}:`, error);
            }
        }
        
        // Clear the queue
        this.iceCandidateQueues.set(peerId, []);
    }

    setupSocketListeners() {
        this.socket.on("data", (data) => {
            this.handleSignalingData(data);
        });
    }

    async addPeer(peerId, username) {
        if (this.peerConnections.has(peerId) || peerId === this.localPeerId) {
            console.log(`Peer ${username} already exists or is self, skipping`);
            return;
        }

        const shouldInitiate = this.shouldInitiateConnection(peerId);
        console.log(`Adding peer: ${username}, should initiate: ${shouldInitiate}`);
        
        // Create connection regardless - but only send offer if we should initiate
        if (!shouldInitiate) {
            console.log(`Creating connection to ${username} but waiting for their offer`);
            
            // Set timeout to detect if expected offer never arrives
            setTimeout(() => {
                const pc = this.peerConnections.get(peerId);
                if (pc && pc.signalingState === "stable" && !this.dataChannels.has(peerId)) {
                    console.log(`TIMEOUT: Expected offer from ${username} but never received it!`);
                    console.log(`This suggests ${username} thinks they should be responder, creating signaling deadlock`);
                    console.log(`Their ID: ${peerId}, Our ID: ${this.localPeerId}`);
                    console.log(`Our logic says we should WAIT (${this.localPeerId} < ${peerId} = ${this.localPeerId < peerId})`);
                }
            }, 5000); // 5 second timeout
        }
        
        try {
            await this.createPeerConnection(peerId, username, shouldInitiate);
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
                ],
                iceCandidatePoolSize: 0,
                iceTransportPolicy: 'all'
            });

            this.peerConnections.set(peerId, peerConnection);
            this.iceCandidateQueues.set(peerId, []); // Initialize ICE candidate queue
            console.log(`Created RTCPeerConnection for ${username}`);

            // Only the offer initiator should create the data channel
            if (shouldInitiateOffer) {
                const dataChannel = peerConnection.createDataChannel("messages", {
                    ordered: true
                });
                console.log(`Created data channel for ${username} (initiator)`);
                
                this.dataChannels.set(peerId, dataChannel);
                this.setupDataChannel(dataChannel, peerId, username);
            } else {
                console.log(`Waiting for data channel from ${username} (responder)`);
                
                // Only responders need to handle incoming data channels
                peerConnection.ondatachannel = (event) => {
                    console.log(`Incoming data channel from ${username}, state: ${event.channel.readyState}`);
                    const channel = event.channel;
                    this.dataChannels.set(peerId, channel);
                    this.setupDataChannel(channel, peerId, username);
                    console.log(`Set up incoming data channel for ${username}, total channels: ${this.dataChannels.size}`);
                };
            }

            // Handle connection state changes
            peerConnection.onconnectionstatechange = () => {
                console.log(`${username} connection: ${peerConnection.connectionState}`);
                if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
                    console.log(`Connection failed/closed for ${username}, removing peer`);
                    this.removePeer(peerId);
                }
            };

            // Handle ICE connection state changes
            peerConnection.oniceconnectionstatechange = () => {
                console.log(`${username} ICE: ${peerConnection.iceConnectionState}`);
                if (peerConnection.iceConnectionState === 'failed') {
                    console.log(`ICE failed for ${username}`);
                }
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

            // Create and send offer if we should initiate
            if (shouldInitiateOffer) {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                this.sendSignalingData(peerId, { type: "offer", offer });
            }
            
        } catch (error) {
            console.error(`Error creating peer connection for ${username}:`, error);
            this.onPeerDisconnected(peerId);
            throw error;
        }
    }



    async removePeer(peerId) {
        // Prevent duplicate cleanup
        if (!this.peerConnections.has(peerId)) {
            console.log(`Peer ${peerId} already removed or never existed`);
            return;
        }
        
        console.log(`Removing peer connection for ${peerId}`);
        
        try {
            // Close and remove peer connection
            if (this.peerConnections.has(peerId)) {
                const pc = this.peerConnections.get(peerId);
                pc.onconnectionstatechange = null;
                pc.oniceconnectionstatechange = null;
                pc.onicecandidate = null;
                pc.ondatachannel = null;
                
                pc.close();
                this.peerConnections.delete(peerId);
            }

            // Close and remove data channel
            if (this.dataChannels.has(peerId)) {
                const channel = this.dataChannels.get(peerId);
                channel.onopen = null;
                channel.onmessage = null;
                channel.onclose = null;
                channel.onerror = null;
                
                if (channel.readyState === 'open' || channel.readyState === 'connecting') {
                    channel.close();
                }
                this.dataChannels.delete(peerId);
            }

            // Clear ICE candidate queue
            this.iceCandidateQueues.delete(peerId);

            console.log(`Successfully removed peer ${peerId}`);

        } catch (error) {
            console.error(`Error removing peer ${peerId}:`, error);
        } finally {
            // Notify callbacks about disconnection
            this.onPeerDisconnected(peerId);
        }
    }

    setupDataChannel(dataChannel, peerId, username) {
        console.log(`Setting up data channel for ${username}, state: ${dataChannel.readyState}`);
        
        dataChannel.onopen = () => {
            console.log(`Data channel OPENED for ${username}`);
            this.onPeerConnected(peerId, username);
        };

        dataChannel.onmessage = (event) => {
            this.onMessage(username, event.data);
        };

        dataChannel.onclose = () => {
            console.log(`Data channel CLOSED for ${username}`);
            this.removePeer(peerId);
        };

        dataChannel.onerror = (error) => {
            console.error(`Data channel ERROR for ${username}:`, error);
            this.removePeer(peerId);
        };
        
        // Monitor data channel state changes
        const checkState = () => {
            console.log(`${username} data channel state: ${dataChannel.readyState}`);
        };
        setTimeout(checkState, 1000);
        setTimeout(checkState, 3000);
    }

    async handleSignalingData(data) {
        const { username, room, senderId, data: signalingData } = data;
        
        if (room !== this.roomName) return;

        let peerConnection = this.peerConnections.get(senderId);
        
        // Create peer connection on-demand ONLY for offers (not answers/candidates)
        if (!peerConnection && signalingData.type === 'offer') {
            console.log(`Received offer from unknown peer ${username} - creating connection to handle it`);
            await this.createPeerConnection(senderId, username, false);
            peerConnection = this.peerConnections.get(senderId);
        }
        
        if (!peerConnection) {
            console.log(`Received ${signalingData.type} from unknown peer ${username} - ignoring`);
            return;
        }

        try {
            switch (signalingData.type) {
                case "offer":
                    console.log(`Offer from ${username}, current state: ${peerConnection.signalingState}`);
                    
                    // Handle glare condition (both peers sent offers)
                    if (peerConnection.signalingState === "have-local-offer") {
                        console.log(`Glare condition with ${username} - both sent offers`);
                        
                        // Use deterministic tiebreaker - lower ID wins and keeps their offer
                        const shouldKeepMyOffer = this.shouldInitiateConnection(senderId);
                        if (shouldKeepMyOffer) {
                            console.log(`Keeping my offer to ${username}, ignoring their offer`);
                            return; // Ignore the incoming offer
                        } else {
                            console.log(`Accepting ${username}'s offer, discarding my offer`);
                            // Rollback to stable state and process their offer
                            await peerConnection.setLocalDescription({type: 'rollback'});
                        }
                    }
                    
                    if (peerConnection.signalingState === "stable") {
                        console.log(`Processing offer from ${username}`);
                        await peerConnection.setRemoteDescription(signalingData.offer);
                        await this.processQueuedIceCandidates(senderId, username);
                        
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        this.sendSignalingData(senderId, { type: "answer", answer });
                        console.log(`Sent answer to ${username}`);
                    } else {
                        console.log(`Ignoring offer from ${username} - wrong state: ${peerConnection.signalingState}`);
                    }
                    break;

                case "answer":
                    console.log(`Answer from ${username}, current state: ${peerConnection.signalingState}`);
                    if (peerConnection.signalingState === "have-local-offer") {
                        console.log(`Processing answer from ${username}`);
                        await peerConnection.setRemoteDescription(signalingData.answer);
                        await this.processQueuedIceCandidates(senderId, username);
                    } else if (peerConnection.signalingState === "stable") {
                        console.log(`UNEXPECTED: ${username} sent answer but we're in stable state - this indicates signaling confusion!`);
                        console.log(`Expected flow: ${username} should send offer (we should be responder), not answer`);
                        // Don't process this answer - it's invalid signaling
                    } else {
                        console.log(`Ignoring answer from ${username} - wrong state: ${peerConnection.signalingState}`);
                    }
                    break;

                case "ice-candidate":
                    await this.handleIceCandidate(senderId, username, signalingData.candidate);
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
                data: data
            });
        } catch (error) {
            console.error('Failed to send signaling data:', error);
        }
    }

    broadcastMessage(message) {
        if (!message || typeof message !== 'string') return;
        
        console.log(`Broadcasting message to ${this.dataChannels.size} data channels`);
        this.messages.push(`You: ${message}`);
        const promises = [];
        this.dataChannels.forEach((channel, peerId) => {
            const peerData = this.peerConnections.get(peerId);
            const username = peerData ? "unknown" : "unknown"; // Username not stored, but log the peerId
            console.log(`Channel to ${peerId}: state=${channel.readyState}, connection=${peerData?.connectionState}`);
            
            if (channel.readyState === "open") {
                try {
                    console.log(`Sending message to ${peerId}`);
                    channel.send(message);
                } catch (error) {
                    console.error(`Failed to send message to peer ${peerId}:`, error);
                    this.emit('error', { error: error.toString(), peerId });
                    promises.push(this.removePeer(peerId));
                }
            } else {
                console.log(`Cannot send to ${peerId} - channel state: ${channel.readyState}`);
            }
        });
        
        if (promises.length > 0) {
            Promise.allSettled(promises).catch(error => {
                console.error('Error cleaning up failed peers:', error);
            });
        }
    }

    cleanup() {
        this.peerConnections.forEach((pc) => pc.close());
        this.dataChannels.forEach((channel) => {
            if (channel.readyState === 'open') channel.close();
        });
        
        this.peerConnections.clear();
        this.dataChannels.clear();
        this.iceCandidateQueues.clear();
        this.connectionAttempts.clear();
        
        if (this.socket) {
            this.socket.off('data');
        }

        WebRTCManager.instance = null;
    }

}

export default WebRTCManager;