/**
 * WebRTC Manager Unit Tests
 * Tests peer connection management, signaling, and message passing
 */

import WebRTCManager from '../../../components/webrtc/webrtc-manager';
import { 
  MockSocketIOClient, 
  MockWebRTCNetwork, 
  setupWebRTCMocks,
  createMockWebRTCEnvironment 
} from './webrtc-mocks';

// Setup WebRTC mocks before tests
beforeAll(() => {
  setupWebRTCMocks();
});

describe('WebRTCManager - Basic Functionality', () => {
  let socket;
  let callbacks;
  let manager;

  beforeEach(() => {
    socket = new MockSocketIOClient('alice');
    callbacks = {
      onMessage: jest.fn(),
      onPeerConnected: jest.fn(),
      onPeerDisconnected: jest.fn()
    };
    
    // Clear any existing instance
    WebRTCManager.instance = null;
  });

  afterEach(() => {
    if (manager) {
      manager.cleanup();
    }
  });

  describe('Initialization', () => {
    test('creates instance with required parameters', () => {
      manager = WebRTCManager.createInstance(
        socket, 
        callbacks.onMessage, 
        callbacks.onPeerConnected, 
        callbacks.onPeerDisconnected
      );

      expect(manager).toBeInstanceOf(WebRTCManager);
      expect(manager.localPeerId).toBe(socket.id);
      expect(manager.peers.size).toBe(0);
    });

    test('throws error with missing parameters', () => {
      expect(() => {
        new WebRTCManager(null, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
      }).toThrow('All callback parameters are required');
    });

    test('singleton pattern works correctly', () => {
      const manager1 = WebRTCManager.createInstance(socket, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
      const manager2 = WebRTCManager.getInstance();
      
      expect(manager1).toBe(manager2);
    });

    test('replaces existing instance on createInstance', () => {
      const manager1 = WebRTCManager.createInstance(socket, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
      const cleanup1 = jest.spyOn(manager1, 'cleanup');
      
      const manager2 = WebRTCManager.createInstance(socket, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
      
      expect(cleanup1).toHaveBeenCalled();
      expect(manager2).not.toBe(manager1);
      expect(WebRTCManager.getInstance()).toBe(manager2);
    });
  });

  describe('User Info Management', () => {
    beforeEach(() => {
      manager = WebRTCManager.createInstance(socket, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
    });

    test('sets user info correctly', () => {
      manager.setUserInfo('alice', 'test-room');
      
      expect(manager.localUsername).toBe('alice');
      expect(manager.roomName).toBe('test-room');
      expect(manager.localPeerId).toBe(socket.id);
    });

    test('deterministic connection initiation', () => {
      manager.setUserInfo('alice', 'test-room');
      
      // Test lexicographic ordering
      expect(manager.shouldInitiateConnection('bob')).toBe(true); // alice < bob
      expect(manager.shouldInitiateConnection('adam')).toBe(false); // alice > adam
      expect(manager.shouldInitiateConnection('alice')).toBe(false); // alice === alice
    });
  });

  describe('Peer Management', () => {
    beforeEach(() => {
      manager = WebRTCManager.createInstance(socket, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
      manager.setUserInfo('alice', 'test-room');
    });

    test('adds peer correctly', async () => {
      const peerId = 'peer-123';
      const username = 'bob';
      
      manager.addPeer(peerId, username);
      
      expect(manager.peers.has(peerId)).toBe(true);
      expect(manager.hasPeer(peerId)).toBe(true);
      
      const peer = manager.peers.get(peerId);
      expect(peer.username).toBe(username);
      expect(peer.pc).toBeDefined();
    });

    test('removes peer correctly', () => {
      const peerId = 'peer-123';
      manager.addPeer(peerId, 'bob');
      
      expect(manager.hasPeer(peerId)).toBe(true);
      
      manager.removePeer(peerId);
      
      expect(manager.hasPeer(peerId)).toBe(false);
      expect(manager.peers.has(peerId)).toBe(false);
    });

    test('prevents duplicate peer addition', () => {
      const peerId = 'peer-123';
      
      manager.addPeer(peerId, 'bob');
      manager.addPeer(peerId, 'bob'); // Duplicate
      
      expect(manager.peers.size).toBe(1);
    });
  });

  describe('Message Broadcasting', () => {
    beforeEach(() => {
      manager = WebRTCManager.createInstance(socket, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
      manager.setUserInfo('alice', 'test-room');
    });

    test('broadcasts message to all connected peers', async () => {
      // Add multiple peers
      manager.addPeer('peer1', 'bob');
      manager.addPeer('peer2', 'charlie');
      
      // Mock data channels as open
      const peer1 = manager.peers.get('peer1');
      const peer2 = manager.peers.get('peer2');
      peer1.channel = { readyState: 'open', send: jest.fn() };
      peer2.channel = { readyState: 'open', send: jest.fn() };
      
      const message = 'test message';
      manager.broadcastMessage(message);
      
      expect(peer1.channel.send).toHaveBeenCalledWith(message);
      expect(peer2.channel.send).toHaveBeenCalledWith(message);
    });

    test('skips peers with closed channels', () => {
      manager.addPeer('peer1', 'bob');
      manager.addPeer('peer2', 'charlie');
      
      const peer1 = manager.peers.get('peer1');
      const peer2 = manager.peers.get('peer2');
      peer1.channel = { readyState: 'open', send: jest.fn() };
      peer2.channel = { readyState: 'closed', send: jest.fn() };
      
      manager.broadcastMessage('test');
      
      expect(peer1.channel.send).toHaveBeenCalled();
      expect(peer2.channel.send).not.toHaveBeenCalled();
    });
  });

  describe('Socket Event Handling', () => {
    beforeEach(() => {
      manager = WebRTCManager.createInstance(socket, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
      manager.setUserInfo('alice', 'test-room');
    });

    test('handles signaling data correctly', async () => {
      const peerId = 'peer-123';
      manager.addPeer(peerId, 'bob');
      
      const peer = manager.peers.get(peerId);
      const handleSignal = jest.spyOn(peer.pc, 'setRemoteDescription');
      
      // Simulate receiving offer
      socket.simulateSignal(peerId, {
        type: 'offer',
        offer: { type: 'offer', sdp: 'mock-offer-sdp' }
      }, 'bob', 'test-room');
      
      // Wait for async handling
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(handleSignal).toHaveBeenCalledWith({
        type: 'offer',
        sdp: 'mock-offer-sdp'
      });
    });

    test('handles ICE candidates correctly', async () => {
      const peerId = 'peer-123';
      await manager.addPeer(peerId, 'bob');
      
      const peer = manager.peers.get(peerId);
      
      // Set remote description first (required for immediate ICE candidate processing)
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: 'mock-answer' });
      
      const handleCandidate = jest.spyOn(peer.pc, 'addIceCandidate');
      
      // Simulate receiving ICE candidate
      socket.simulateSignal(peerId, {
        type: 'ice-candidate',
        candidate: { candidate: 'mock-candidate' }
      }, 'bob', 'test-room');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(handleCandidate).toHaveBeenCalled();
    });
  });

  describe('Connection Lifecycle', () => {
    beforeEach(() => {
      manager = WebRTCManager.createInstance(socket, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
      manager.setUserInfo('alice', 'test-room');
    });

    test('establishes connection when initiating', async () => {
      // alice < bob, so alice should initiate
      const peerId = 'bob';
      
      // Spy on the mock class before creating peer
      const createOfferSpy = jest.spyOn(global.RTCPeerConnection.prototype, 'createOffer');
      
      await manager.addPeer(peerId, 'bob');
      
      // Wait for connection initiation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(createOfferSpy).toHaveBeenCalled();
      createOfferSpy.mockRestore();
    });

    test('calls onPeerConnected when connection established', async () => {
      const peerId = 'peer-123';
      
      await manager.addPeer(peerId, 'bob');
      
      const peer = manager.peers.get(peerId);
      
      // Simulate data channel opening instead of connection state change
      // because onPeerConnected is called from dataChannel.onopen
      await new Promise(resolve => setTimeout(resolve, 50));
      
      if (peer.channel) {
        peer.channel._setState('open');
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(callbacks.onPeerConnected).toHaveBeenCalledWith(peerId, 'bob');
    });

    test('calls onPeerDisconnected when peer removed', () => {
      const peerId = 'peer-123';
      manager.addPeer(peerId, 'bob');
      
      manager.removePeer(peerId);
      
      expect(callbacks.onPeerDisconnected).toHaveBeenCalledWith(peerId);
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      manager = WebRTCManager.createInstance(socket, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
      manager.setUserInfo('alice', 'test-room');
    });

    test('calls onMessage when receiving data channel message', async () => {
      const peerId = 'peer-123';
      const username = 'bob';
      const message = 'test message';
      
      await manager.addPeer(peerId, username);
      
      const peer = manager.peers.get(peerId);
      
      // Wait for channel setup, then simulate receiving message
      await new Promise(resolve => setTimeout(resolve, 50));
      
      if (peer.channel && peer.channel._simulateReceive) {
        peer.channel._simulateReceive(message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(callbacks.onMessage).toHaveBeenCalledWith(username, message);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      manager = WebRTCManager.createInstance(socket, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
      manager.setUserInfo('alice', 'test-room');
    });

    test('cleans up all peers and connections', () => {
      manager.addPeer('peer1', 'bob');
      manager.addPeer('peer2', 'charlie');
      
      expect(manager.peers.size).toBe(2);
      
      manager.cleanup();
      
      expect(manager.peers.size).toBe(0);
      expect(WebRTCManager.instance).toBeNull();
    });

    test('closes peer connections during cleanup', () => {
      manager.addPeer('peer1', 'bob');
      
      const peer = manager.peers.get('peer1');
      const closeSpy = jest.spyOn(peer.pc, 'close');
      
      manager.cleanup();
      
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});

describe('WebRTCManager - Network Simulation', () => {
  let network;
  let callbacks;

  beforeEach(() => {
    const env = createMockWebRTCEnvironment();
    network = env.network;
    callbacks = env.callbacks;
  });

  test('simulates peer-to-peer connection', async () => {
    const socket1 = network.createPeer('alice');
    const socket2 = network.createPeer('bob');
    
    const manager1 = WebRTCManager.createInstance(socket1, callbacks.onMessage, callbacks.onPeerConnected, callbacks.onPeerDisconnected);
    manager1.setUserInfo('alice', 'test-room');
    
    // Simulate peer joining
    socket1.simulatePeerJoin('bob', 'bob');
    manager1.addPeer('bob', 'bob');
    
    expect(manager1.hasPeer('bob')).toBe(true);
  });

  test('simulates network partition', () => {
    const socket1 = network.createPeer('alice');
    const socket2 = network.createPeer('bob');
    
    network.partitionNetwork(['alice'], ['bob']);
    
    // Messages should not be delivered
    network.sendMessage('alice', 'bob', 'test message');
    
    const bobPeer = network.peers.get('bob');
    expect(bobPeer.socket.getEmittedEvents('message')).toHaveLength(0);
  });

  test('simulates packet loss', () => {
    const socket1 = network.createPeer('alice');
    const socket2 = network.createPeer('bob');
    
    network.setNetworkConditions({ packetLoss: 1.0 }); // 100% loss
    
    network.sendMessage('alice', 'bob', 'test message');
    
    const bobPeer = network.peers.get('bob');
    expect(bobPeer.socket.getEmittedEvents('message')).toHaveLength(0);
  });
});