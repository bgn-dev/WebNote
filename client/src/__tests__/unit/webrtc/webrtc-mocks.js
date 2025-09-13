/**
 * WebRTC Testing Mocks and Utilities
 * Provides comprehensive mocking for WebRTC APIs and signaling
 */

// Mock RTCPeerConnection
export class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.localDescription = null;
    this.remoteDescription = null;
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.iceGatheringState = 'new';
    this.signalingState = 'stable';
    
    this.localCandidates = [];
    this.remoteCandidates = [];
    this.dataChannels = new Map();
    this.eventListeners = new Map();
    
    // Simulate async behavior
    this._asyncOperations = [];
  }

  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  removeEventListener(event, handler) {
    if (this.eventListeners.has(event)) {
      const handlers = this.eventListeners.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  _emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(handler => {
        setTimeout(() => handler(data), 0);
      });
    }
  }

  createDataChannel(label, options = {}) {
    const channel = new MockRTCDataChannel(label, options, this);
    this.dataChannels.set(label, channel);
    
    // Simulate channel opening
    setTimeout(() => {
      channel._setState('open');
      this._emit('datachannel', { channel });
    }, 10);
    
    return channel;
  }

  async createOffer(options = {}) {
    await this._simulateAsync(50);
    const offer = {
      type: 'offer',
      sdp: `mock-offer-${Date.now()}`
    };
    return offer;
  }

  async createAnswer(options = {}) {
    await this._simulateAsync(50);
    const answer = {
      type: 'answer', 
      sdp: `mock-answer-${Date.now()}`
    };
    return answer;
  }

  async setLocalDescription(description) {
    await this._simulateAsync(30);
    this.localDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
    
    // Simulate ICE candidate generation
    setTimeout(() => {
      const candidate = {
        candidate: 'candidate:mock-candidate-1',
        sdpMLineIndex: 0,
        sdpMid: 'data'
      };
      this.localCandidates.push(candidate);
      this._emit('icecandidate', { candidate });
    }, 100);
  }

  async setRemoteDescription(description) {
    await this._simulateAsync(30);
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    
    // Simulate connection establishment
    if (this.localDescription && this.remoteDescription) {
      setTimeout(() => {
        this.connectionState = 'connected';
        this.iceConnectionState = 'connected';
        this._emit('connectionstatechange');
        this._emit('iceconnectionstatechange');
        
        // Open data channels
        this.dataChannels.forEach(channel => {
          if (channel.readyState === 'connecting') {
            channel._setState('open');
          }
        });
      }, 150);
    }
  }

  async addIceCandidate(candidate) {
    await this._simulateAsync(20);
    this.remoteCandidates.push(candidate);
  }

  close() {
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
    this.dataChannels.forEach(channel => channel._setState('closed'));
    this._emit('connectionstatechange');
  }

  async _simulateAsync(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Mock RTCDataChannel
export class MockRTCDataChannel {
  constructor(label, options, peerConnection) {
    this.label = label;
    this.options = options;
    this.peerConnection = peerConnection;
    this.readyState = 'connecting';
    this.bufferedAmount = 0;
    this.eventListeners = new Map();
    
    this.sentMessages = [];
    this.receivedMessages = [];
  }

  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  removeEventListener(event, handler) {
    if (this.eventListeners.has(event)) {
      const handlers = this.eventListeners.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  _emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(handler => {
        setTimeout(() => handler(data), 0);
      });
    }
  }

  _setState(state) {
    this.readyState = state;
    this._emit(state === 'open' ? 'open' : state);
    
    // Also call the callback directly for WebRTC compatibility
    if (state === 'open' && this.onopen && typeof this.onopen === 'function') {
      setTimeout(() => {
        if (this.onopen && typeof this.onopen === 'function') {
          this.onopen();
        }
      }, 0);
    } else if (state === 'closed' && this.onclose && typeof this.onclose === 'function') {
      setTimeout(() => {
        if (this.onclose && typeof this.onclose === 'function') {
          this.onclose();
        }
      }, 0);
    }
  }

  send(data) {
    if (this.readyState !== 'open') {
      throw new Error('DataChannel is not open');
    }
    
    this.sentMessages.push(data);
    
    // Simulate message transmission
    setTimeout(() => {
      this.bufferedAmount = 0;
    }, 1);
  }

  // Test utility to simulate receiving messages
  _simulateReceive(data) {
    if (this.readyState === 'open') {
      this.receivedMessages.push(data);
      this._emit('message', { data });
      
      // Also call the callback directly for WebRTC compatibility
      if (typeof this.onmessage === 'function') {
        setTimeout(() => this.onmessage({ data }), 0);
      }
    }
  }
  
  close() {
    this._setState('closed');
  }
}

// Mock Socket.IO client
export class MockSocketIOClient {
  constructor(id = null) {
    this.id = id || `mock-socket-${Math.random().toString(36).substr(2, 9)}`;
    this.connected = true;
    this.eventListeners = new Map();
    this.emittedEvents = [];
  }

  connect() {
    this.connected = true;
    setTimeout(() => this._emit('connect'), 10);
    return this;
  }

  disconnect() {
    this.connected = false;
    this._emit('disconnect');
  }

  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  off(event, handler) {
    if (this.eventListeners.has(event)) {
      const handlers = this.eventListeners.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  emit(event, data) {
    this.emittedEvents.push({ event, data, timestamp: Date.now() });
    
    // Handle some events automatically for testing
    if (event === 'join') {
      setTimeout(() => {
        this._emit('ready', { 
          username: data.username, 
          peers: [] // Can be customized in tests
        });
      }, 50);
    }
  }

  _emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(handler => {
        setTimeout(() => handler(data), 0);
      });
    }
  }

  // Test utilities
  simulateSignal(fromPeerId, signal, fromUsername = `user-${fromPeerId}`, room = 'test-room') {
    this._emit('data', {
      username: fromUsername,
      room: room,
      senderId: fromPeerId,
      data: signal
    });
  }

  simulatePeerJoin(peerId, username) {
    this._emit('new_peer', { sid: peerId, username });
  }

  simulatePeerLeave(peerId, username) {
    this._emit('peer_left', { sid: peerId, username });
  }

  getEmittedEvents(eventType) {
    return this.emittedEvents.filter(e => e.event === eventType);
  }

  clearEmittedEvents() {
    this.emittedEvents = [];
  }
}

// Mock WebRTC Network Simulator
export class MockWebRTCNetwork {
  constructor() {
    this.peers = new Map(); // peerId -> MockSocketIOClient
    this.connections = new Map(); // connectionId -> { from, to, channel }
    this.networkConditions = {
      latency: 0,
      packetLoss: 0,
      partitions: new Set()
    };
  }

  createPeer(peerId, username = `user-${peerId}`) {
    const socket = new MockSocketIOClient(peerId);
    this.peers.set(peerId, { socket, username });
    return socket;
  }

  connectPeers(peerId1, peerId2) {
    const peer1 = this.peers.get(peerId1);
    const peer2 = this.peers.get(peerId2);
    
    if (!peer1 || !peer2) {
      throw new Error('Peers must be created first');
    }

    const connectionId = `${peerId1}-${peerId2}`;
    this.connections.set(connectionId, { 
      from: peerId1, 
      to: peerId2,
      established: false 
    });

    // Simulate signaling exchange
    setTimeout(() => {
      peer1.socket.simulateSignal(peerId2, { type: 'offer' });
      peer2.socket.simulateSignal(peerId1, { type: 'answer' });
      
      const conn = this.connections.get(connectionId);
      conn.established = true;
    }, 100);
  }

  sendMessage(fromPeerId, toPeerId, message) {
    if (this._isPartitioned(fromPeerId, toPeerId)) {
      return; // Message lost due to partition
    }

    if (Math.random() < this.networkConditions.packetLoss) {
      return; // Message lost
    }

    const delay = this.networkConditions.latency;
    const toPeer = this.peers.get(toPeerId);
    
    if (toPeer) {
      setTimeout(() => {
        toPeer.socket._emit('message', { 
          fromPeerId, 
          data: message 
        });
      }, delay);
    }
  }

  setNetworkConditions(conditions) {
    Object.assign(this.networkConditions, conditions);
  }

  partitionNetwork(group1, group2) {
    this.networkConditions.partitions.add(`${group1.join(',')}-${group2.join(',')}`);
  }

  healPartition() {
    this.networkConditions.partitions.clear();
  }

  _isPartitioned(peer1, peer2) {
    for (const partition of this.networkConditions.partitions) {
      const [group1, group2] = partition.split('-');
      const peers1 = group1.split(',');
      const peers2 = group2.split(',');
      
      if ((peers1.includes(peer1) && peers2.includes(peer2)) ||
          (peers2.includes(peer1) && peers1.includes(peer2))) {
        return true;
      }
    }
    return false;
  }

  getAllPeers() {
    return Array.from(this.peers.keys());
  }

  getConnectionStatus(peerId1, peerId2) {
    const connectionId = `${peerId1}-${peerId2}`;
    const reverseId = `${peerId2}-${peerId1}`;
    
    return this.connections.get(connectionId) || 
           this.connections.get(reverseId) || 
           { established: false };
  }
}

// Global mocks for Jest
export const setupWebRTCMocks = () => {
  global.RTCPeerConnection = MockRTCPeerConnection;
  global.RTCSessionDescription = class MockRTCSessionDescription {
    constructor(init) {
      Object.assign(this, init);
    }
  };
  global.RTCIceCandidate = class MockRTCIceCandidate {
    constructor(init) {
      Object.assign(this, init);
    }
  };
};

// Test utilities
export const createMockWebRTCEnvironment = () => {
  const network = new MockWebRTCNetwork();
  const callbacks = {
    onMessage: jest.fn(),
    onPeerConnected: jest.fn(), 
    onPeerDisconnected: jest.fn()
  };
  
  return { network, callbacks };
};