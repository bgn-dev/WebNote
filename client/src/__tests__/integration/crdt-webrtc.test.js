/**
 * Integration Tests: CRDT + WebRTC
 * Tests real-time collaborative editing with mocked WebRTC
 */

import PeritextDocument from '../../components/crdt/peritext-document';
import WebRTCManager from '../../components/webrtc/webrtc-manager';
import { 
  MockSocketIOClient, 
  MockWebRTCNetwork, 
  setupWebRTCMocks 
} from '../utils/webrtc-mocks.mjs';

// Setup mocks
beforeAll(() => {
  setupWebRTCMocks();
});

describe('CRDT + WebRTC Integration', () => {
  let network;
  let aliceSocket, bobSocket;
  let aliceManager, bobManager;
  let aliceDoc, bobDoc;
  let aliceMessages, bobMessages;

  beforeEach(() => {
    // Setup network
    network = new MockWebRTCNetwork();
    aliceSocket = network.createPeer('alice');
    bobSocket = network.createPeer('bob');

    // Setup CRDT documents
    aliceDoc = new PeritextDocument('alice');
    bobDoc = new PeritextDocument('bob');

    // Message collectors
    aliceMessages = [];
    bobMessages = [];

    // Setup WebRTC managers with CRDT integration
    aliceManager = WebRTCManager.createInstance(
      aliceSocket,
      (username, message) => {
        aliceMessages.push({ from: username, message });
        // Simulate applying remote CRDT operation
        try {
          const data = JSON.parse(message);
          if (data.type === 'crdt_operation') {
            aliceDoc.applyOperation(data.operation);
          }
        } catch (e) {
          // Ignore non-JSON messages
        }
      },
      (peerId, username) => console.log(`Alice: ${username} connected`),
      (peerId) => console.log(`Alice: peer ${peerId} disconnected`)
    );

    bobManager = WebRTCManager.createInstance(
      bobSocket,
      (username, message) => {
        bobMessages.push({ from: username, message });
        // Simulate applying remote CRDT operation
        try {
          const data = JSON.parse(message);
          if (data.type === 'crdt_operation') {
            bobDoc.applyOperation(data.operation);
          }
        } catch (e) {
          // Ignore non-JSON messages
        }
      },
      (peerId, username) => console.log(`Bob: ${username} connected`),
      (peerId) => console.log(`Bob: peer ${peerId} disconnected`)
    );

    aliceManager.setUserInfo('alice', 'test-room');
    bobManager.setUserInfo('bob', 'test-room');
  });

  afterEach(() => {
    aliceManager?.cleanup();
    bobManager?.cleanup();
    WebRTCManager.instance = null;
  });

  describe('Basic Collaborative Editing', () => {
    test('two users can edit concurrently and converge', async () => {
      // Establish connection
      aliceManager.addPeer('bob', 'bob');
      bobManager.addPeer('alice', 'alice');

      // Simulate data channels being open
      const alicePeer = aliceManager.peers.get('bob');
      const bobPeer = bobManager.peers.get('alice');
      
      alicePeer.channel = { 
        readyState: 'open', 
        send: jest.fn((msg) => {
          // Simulate message transmission to Bob
          setTimeout(() => {
            bobManager.onMessage('alice', msg);
          }, 10);
        })
      };
      
      bobPeer.channel = { 
        readyState: 'open', 
        send: jest.fn((msg) => {
          // Simulate message transmission to Alice
          setTimeout(() => {
            aliceManager.onMessage('bob', msg);
          }, 10);
        })
      };

      // Alice types "Hello"
      let leftOpId = aliceDoc.root.opId;
      for (const char of 'Hello') {
        const newOpId = aliceDoc.insert(char, leftOpId);
        const operation = aliceDoc.createOperation('insert', {
          opId: newOpId,
          char,
          leftId: leftOpId
        });
        
        // Broadcast operation
        aliceManager.broadcastMessage(JSON.stringify({
          type: 'crdt_operation',
          operation
        }));
        
        leftOpId = newOpId;
      }

      // Bob types "World" at same position
      leftOpId = bobDoc.root.opId;
      for (const char of 'World') {
        const newOpId = bobDoc.insert(char, leftOpId);
        const operation = bobDoc.createOperation('insert', {
          opId: newOpId,
          char,
          leftId: leftOpId
        });
        
        // Broadcast operation
        bobManager.broadcastMessage(JSON.stringify({
          type: 'crdt_operation',
          operation
        }));
        
        leftOpId = newOpId;
      }

      // Wait for message propagation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Both documents should converge
      expect(aliceDoc.getText()).toBe(bobDoc.getText());
      expect(aliceDoc.getText()).toMatch(/^(HelloWorld|WorldHello)$/);
      
      // Should have received messages
      expect(aliceMessages.length).toBeGreaterThan(0);
      expect(bobMessages.length).toBeGreaterThan(0);
    });

    test('operations maintain causal order', async () => {
      // Setup connection
      aliceManager.addPeer('bob', 'bob');
      bobManager.addPeer('alice', 'alice');

      // Mock channels
      const alicePeer = aliceManager.peers.get('bob');
      const bobPeer = bobManager.peers.get('alice');
      
      alicePeer.channel = { 
        readyState: 'open', 
        send: jest.fn((msg) => {
          setTimeout(() => bobManager.onMessage('alice', msg), 10);
        })
      };
      
      bobPeer.channel = { 
        readyState: 'open', 
        send: jest.fn((msg) => {
          setTimeout(() => aliceManager.onMessage('bob', msg), 10);
        })
      };

      // Alice builds "ABC" sequentially
      let leftOpId = aliceDoc.root.opId;
      const aliceOps = [];
      
      for (const char of 'ABC') {
        const newOpId = aliceDoc.insert(char, leftOpId);
        const operation = aliceDoc.createOperation('insert', {
          opId: newOpId,
          char,
          leftId: leftOpId
        });
        aliceOps.push(operation);
        leftOpId = newOpId;
      }

      // Send operations with delays to test ordering
      for (let i = 0; i < aliceOps.length; i++) {
        setTimeout(() => {
          aliceManager.broadcastMessage(JSON.stringify({
            type: 'crdt_operation',
            operation: aliceOps[i]
          }));
        }, i * 50);
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      expect(bobDoc.getText()).toBe('ABC');
    });
  });

  describe('Network Conditions', () => {
    test('handles network partition and recovery', async () => {
      // Setup connection
      aliceManager.addPeer('bob', 'bob');
      bobManager.addPeer('alice', 'alice');

      // Mock channels
      let networkUp = true;
      const alicePeer = aliceManager.peers.get('bob');
      const bobPeer = bobManager.peers.get('alice');
      
      alicePeer.channel = { 
        readyState: 'open', 
        send: jest.fn((msg) => {
          if (networkUp) {
            setTimeout(() => bobManager.onMessage('alice', msg), 10);
          }
        })
      };
      
      bobPeer.channel = { 
        readyState: 'open', 
        send: jest.fn((msg) => {
          if (networkUp) {
            setTimeout(() => aliceManager.onMessage('bob', msg), 10);
          }
        })
      };

      // Alice types while connected
      let leftOpId = aliceDoc.insert('A', aliceDoc.root.opId);
      let operation = aliceDoc.createOperation('insert', {
        opId: leftOpId,
        char: 'A',
        leftId: aliceDoc.root.opId
      });
      
      aliceManager.broadcastMessage(JSON.stringify({
        type: 'crdt_operation',
        operation
      }));

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(bobDoc.getText()).toBe('A');

      // Simulate network partition
      networkUp = false;

      // Alice types while partitioned
      leftOpId = aliceDoc.insert('B', leftOpId);
      operation = aliceDoc.createOperation('insert', {
        opId: leftOpId,
        char: 'B',
        leftId: '1@alice'
      });
      
      aliceManager.broadcastMessage(JSON.stringify({
        type: 'crdt_operation',
        operation
      }));

      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Bob shouldn't receive the update
      expect(aliceDoc.getText()).toBe('AB');
      expect(bobDoc.getText()).toBe('A');

      // Restore network and resend
      networkUp = true;
      aliceManager.broadcastMessage(JSON.stringify({
        type: 'crdt_operation',
        operation
      }));

      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Now Bob should receive it
      expect(bobDoc.getText()).toBe('AB');
    });

    test('handles message loss gracefully', async () => {
      // Setup connection with lossy channel
      aliceManager.addPeer('bob', 'bob');
      
      const alicePeer = aliceManager.peers.get('bob');
      let messageCount = 0;
      
      alicePeer.channel = { 
        readyState: 'open', 
        send: jest.fn((msg) => {
          messageCount++;
          // Drop every other message
          if (messageCount % 2 === 0) {
            setTimeout(() => bobManager.onMessage('alice', msg), 10);
          }
        })
      };

      // Send multiple operations - some at root to be independent
      for (const char of 'ABCD') {
        // Insert at root position so operations are independent
        const newOpId = aliceDoc.insert(char, aliceDoc.root.opId);
        const operation = aliceDoc.createOperation('insert', {
          opId: newOpId,
          char,
          leftId: aliceDoc.root.opId
        });
        
        aliceManager.broadcastMessage(JSON.stringify({
          type: 'crdt_operation',
          operation
        }));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Bob should have received only some messages
      expect(bobDoc.getText().length).toBeLessThan(4);
      expect(bobDoc.getText().length).toBeGreaterThan(0);
    });
  });

  describe('Complex Scenarios', () => {
    test('three-way collaborative editing', async () => {
      // Add Charlie
      const charlieSocket = network.createPeer('charlie');
      const charlieDoc = new PeritextDocument('charlie');
      const charlieMessages = [];

      const charlieManager = WebRTCManager.createInstance(
        charlieSocket,
        (username, message) => {
          charlieMessages.push({ from: username, message });
          try {
            const data = JSON.parse(message);
            if (data.type === 'crdt_operation') {
              charlieDoc.applyOperation(data.operation);
            }
          } catch (e) {
            // Ignore non-JSON messages
          }
        },
        (peerId, username) => console.log(`Charlie: ${username} connected`),
        (peerId) => console.log(`Charlie: peer ${peerId} disconnected`)
      );

      charlieManager.setUserInfo('charlie', 'test-room');

      // Setup connections (everyone connected to everyone)
      aliceManager.addPeer('bob', 'bob');
      aliceManager.addPeer('charlie', 'charlie');
      bobManager.addPeer('alice', 'alice');
      bobManager.addPeer('charlie', 'charlie');
      charlieManager.addPeer('alice', 'alice');
      charlieManager.addPeer('bob', 'bob');

      // Mock full mesh network
      const broadcastToAll = (fromManager, message) => {
        if (fromManager === aliceManager) {
          bobManager.onMessage('alice', message);
          charlieManager.onMessage('alice', message);
        } else if (fromManager === bobManager) {
          aliceManager.onMessage('bob', message);
          charlieManager.onMessage('bob', message);
        } else if (fromManager === charlieManager) {
          aliceManager.onMessage('charlie', message);
          bobManager.onMessage('charlie', message);
        }
      };

      // Mock channels for all peers
      ['alice', 'bob', 'charlie'].forEach(fromUser => {
        const manager = fromUser === 'alice' ? aliceManager : fromUser === 'bob' ? bobManager : charlieManager;
        manager.peers.forEach(peer => {
          peer.channel = { 
            readyState: 'open', 
            send: jest.fn((msg) => {
              setTimeout(() => broadcastToAll(manager, msg), 10);
            })
          };
        });
      });

      // Each user types at the same position
      const operations = [
        { doc: aliceDoc, manager: aliceManager, char: 'A', user: 'alice' },
        { doc: bobDoc, manager: bobManager, char: 'B', user: 'bob' },
        { doc: charlieDoc, manager: charlieManager, char: 'C', user: 'charlie' }
      ];

      operations.forEach(({ doc, manager, char, user }) => {
        const opId = doc.insert(char, doc.root.opId);
        const operation = doc.createOperation('insert', {
          opId,
          char,
          leftId: doc.root.opId
        });
        
        manager.broadcastMessage(JSON.stringify({
          type: 'crdt_operation',
          operation
        }));
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // All three documents should converge
      const aliceText = aliceDoc.getText();
      const bobText = bobDoc.getText();
      const charlieText = charlieDoc.getText();

      expect(aliceText).toBe(bobText);
      expect(bobText).toBe(charlieText);
      expect(aliceText).toMatch(/^[ABC]{3}$/); // Contains A, B, C in some order

      charlieManager.cleanup();
    });
  });
});

describe('WebRTC Error Handling', () => {
  let socket, manager, doc;

  beforeEach(() => {
    socket = new MockSocketIOClient();
    doc = new PeritextDocument('test-user');
    
    manager = WebRTCManager.createInstance(
      socket,
      (username, message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'crdt_operation') {
            doc.applyOperation(data.operation);
          }
        } catch (e) {
          console.log('Failed to parse message:', e);
        }
      },
      jest.fn(),
      jest.fn()
    );
  });

  afterEach(() => {
    manager?.cleanup();
  });

  test('handles malformed CRDT operations', async () => {
    manager.setUserInfo('test-user', 'test-room');
    
    const initialText = doc.getText();
    
    // Simulate receiving malformed operation
    manager.onMessage('other-user', JSON.stringify({
      type: 'crdt_operation',
      operation: { invalid: 'operation' }
    }));

    await new Promise(resolve => setTimeout(resolve, 50));

    // Document should remain unchanged
    expect(doc.getText()).toBe(initialText);
  });

  test('handles connection failures gracefully', () => {
    manager.addPeer('peer1', 'user1');
    
    const peer = manager.peers.get('peer1');
    
    // Simulate connection failure
    peer.pc.connectionState = 'failed';
    peer.pc._emit('connectionstatechange');

    // Should handle gracefully without throwing
    expect(() => {
      manager.broadcastMessage('test message');
    }).not.toThrow();
  });
});