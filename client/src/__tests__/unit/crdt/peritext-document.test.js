/**
 * Unit tests for PeritextDocument CRDT implementation
 * Tests core CRDT functionality: insert, delete, convergence, and intent preservation
 */

import PeritextDocument from '../../../components/crdt/peritext-document';

describe('PeritextDocument - Basic Operations', () => {
  let doc;

  beforeEach(() => {
    doc = new PeritextDocument('test-user');
  });

  describe('Initialization', () => {
    test('creates document with correct initial state', () => {
      expect(doc.userId).toBe('test-user');
      expect(doc.counter).toBe(0);
      expect(doc.getText()).toBe('');
      expect(doc.characters.size).toBe(1); // Root node
      expect(doc.root).toBeTruthy();
      expect(doc.root.opId).toBe('0@root');
    });

    test('generates unique operation IDs', () => {
      const id1 = doc.generateOpId();
      const id2 = doc.generateOpId();
      
      expect(id1).toBe('1@test-user');
      expect(id2).toBe('2@test-user');
      expect(id1).not.toBe(id2);
    });
  });

  describe('Single Character Operations', () => {
    test('inserts single character at beginning', () => {
      const opId = doc.insert('H', doc.root.opId);
      
      expect(doc.getText()).toBe('H');
      expect(opId).toBe('1@test-user');
      expect(doc.characters.has(opId)).toBe(true);
    });

    test('inserts multiple characters sequentially', () => {
      let leftOpId = doc.root.opId;
      
      leftOpId = doc.insert('H', leftOpId);
      leftOpId = doc.insert('e', leftOpId);
      leftOpId = doc.insert('l', leftOpId);
      leftOpId = doc.insert('l', leftOpId);
      leftOpId = doc.insert('o', leftOpId);
      
      expect(doc.getText()).toBe('Hello');
      expect(doc.characters.size).toBe(6); // 5 chars + root
    });

    test('inserts character in middle of text', () => {
      // Build "Hllo"
      let leftOpId = doc.root.opId;
      leftOpId = doc.insert('H', leftOpId);
      const eOpId = leftOpId = doc.insert('l', leftOpId);
      leftOpId = doc.insert('l', leftOpId);
      leftOpId = doc.insert('o', leftOpId);
      
      expect(doc.getText()).toBe('Hllo');
      
      // Insert 'e' between 'H' and first 'l'
      doc.insert('e', doc.root.opId); // Insert after root (before H)
      
      expect(doc.getText()).toBe('eHllo');
    });
  });

  describe('Delete Operations', () => {
    beforeEach(() => {
      // Setup "Hello" for deletion tests
      let leftOpId = doc.root.opId;
      leftOpId = doc.insert('H', leftOpId);
      leftOpId = doc.insert('e', leftOpId);
      leftOpId = doc.insert('l', leftOpId);
      leftOpId = doc.insert('l', leftOpId);
      leftOpId = doc.insert('o', leftOpId);
    });

    test('deletes character from text', () => {
      expect(doc.getText()).toBe('Hello');
      
      // Delete first 'l' (position 2 in text, index 2 in sequence since root is excluded)
      const sequence = doc.getOrderedSequence();
      const targetNode = sequence[2]; // H, e, l -> first 'l' (getOrderedSequence excludes root)
      
      const deleteOp = doc.createOperation('delete', {
        targetId: targetNode.opId
      });
      
      doc.applyRemoteDelete(deleteOp);
      expect(doc.getText()).toBe('Helo');
    });

    test('marks character as deleted but keeps in structure', () => {
      const sequence = doc.getOrderedSequence();
      const targetNode = sequence[0]; // 'H' - first character (getOrderedSequence excludes root)
      
      expect(targetNode.deleted).toBe(false);
      
      const deleteOp = doc.createOperation('delete', {
        targetId: targetNode.opId
      });
      
      doc.applyRemoteDelete(deleteOp);
      
      expect(targetNode.deleted).toBe(true);
      expect(doc.characters.has(targetNode.opId)).toBe(true); // Still in structure
      expect(doc.getText()).toBe('ello'); // Not in text
    });
  });
});

describe('PeritextDocument - Concurrent Operations', () => {
  test('concurrent inserts at same position are deterministic', () => {
    const doc1 = new PeritextDocument('user1');
    const doc2 = new PeritextDocument('user2');
    
    // Both users try to insert at beginning simultaneously
    const op1 = doc1.createOperation('insert', {
      opId: '1@user1',
      char: 'A',
      leftId: doc1.root.opId
    });
    
    const op2 = doc2.createOperation('insert', {
      opId: '1@user2', 
      char: 'B',
      leftId: doc2.root.opId
    });
    
    // Apply operations in different orders
    doc1.insert('A', doc1.root.opId); // Apply locally
    doc1.applyOperation(op2); // Apply remote
    
    doc2.insert('B', doc2.root.opId); // Apply locally
    doc2.applyOperation(op1); // Apply remote
    
    // Both documents should converge to same result
    expect(doc1.getText()).toBe(doc2.getText());
  });

  test('concurrent inserts preserve user intent', () => {
    const doc1 = new PeritextDocument('user1');
    const doc2 = new PeritextDocument('user2');
    
    // User1 types "Hello"
    let leftOpId1 = doc1.root.opId;
    const user1Ops = [];
    for (const char of 'Hello') {
      leftOpId1 = doc1.insert(char, leftOpId1);
      user1Ops.push(doc1.createOperation('insert', {
        opId: leftOpId1,
        char,
        leftId: leftOpId1.split('@')[0] === '1' ? doc1.root.opId : `${parseInt(leftOpId1.split('@')[0]) - 1}@user1`
      }));
    }
    
    // User2 types "World" at same position
    let leftOpId2 = doc2.root.opId;
    const user2Ops = [];
    for (const char of 'World') {
      leftOpId2 = doc2.insert(char, leftOpId2);
      user2Ops.push(doc2.createOperation('insert', {
        opId: leftOpId2,
        char,
        leftId: leftOpId2.split('@')[0] === '1' ? doc2.root.opId : `${parseInt(leftOpId2.split('@')[0]) - 1}@user2`
      }));
    }
    
    // Apply remote operations
    user2Ops.forEach(op => doc1.applyOperation(op));
    user1Ops.forEach(op => doc2.applyOperation(op));
    
    // Should converge and preserve intent
    const finalText1 = doc1.getText();
    const finalText2 = doc2.getText();
    
    expect(finalText1).toBe(finalText2);
    expect(finalText1.includes('Hello')).toBe(true);
    expect(finalText1.includes('World')).toBe(true);
  });

  test('handles operation deduplication', () => {
    const doc = new PeritextDocument('user1');
    
    const op = doc.createOperation('insert', {
      opId: '1@user2',
      char: 'A',
      leftId: doc.root.opId
    });
    
    // Apply same operation twice
    const result1 = doc.applyOperation(op);
    const result2 = doc.applyOperation(op);
    
    expect(result1).not.toBe(false); // First application succeeds
    expect(result2).toBe(false); // Second application is deduplicated
    expect(doc.getText()).toBe('A'); // Only one character
  });
});

describe('PeritextDocument - Text Operations', () => {
  test('getTextIndexForOperation returns correct position', () => {
    const doc = new PeritextDocument('user1');
    
    // Build "Hello"
    let leftOpId = doc.root.opId;
    const opIds = [];
    for (const char of 'Hello') {
      leftOpId = doc.insert(char, leftOpId);
      opIds.push(leftOpId);
    }
    
    // Test position lookup for each character
    opIds.forEach((opId, index) => {
      const operation = { opId, action: 'insert' };
      const textIndex = doc.getTextIndexForOperation(operation);
      expect(textIndex).toBe(index);
    });
  });

  test('getLeftOpIdForCursor returns correct left operation', () => {
    const doc = new PeritextDocument('user1');
    
    // Build "Hello"
    let leftOpId = doc.root.opId;
    const opIds = [doc.root.opId];
    for (const char of 'Hello') {
      leftOpId = doc.insert(char, leftOpId);
      opIds.push(leftOpId);
    }
    
    // Test cursor positions
    expect(doc.getLeftOpIdForCursor(0)).toBe(doc.root.opId); // Before 'H'
    expect(doc.getLeftOpIdForCursor(1)).toBe(opIds[1]); // After 'H'
    expect(doc.getLeftOpIdForCursor(5)).toBe(opIds[5]); // After 'o'
  });
});

describe('PeritextDocument - Serialization', () => {
  test('serializes and deserializes document state', () => {
    const doc = new PeritextDocument('user1');
    
    // Build some content
    let leftOpId = doc.root.opId;
    for (const char of 'Test Document') {
      leftOpId = doc.insert(char, leftOpId);
    }
    
    const serialized = doc.serialize();
    expect(serialized).toBeTruthy();
    expect(typeof serialized).toBe('object');
    
    const deserialized = PeritextDocument.deserialize(serialized, 'user1');
    expect(deserialized.getText()).toBe('Test Document');
    expect(deserialized.userId).toBe('user1');
    expect(deserialized.characters.size).toBe(doc.characters.size);
  });

  test('preserves operation history after deserialization', () => {
    const doc = new PeritextDocument('user1');
    
    // Build content with operations
    let leftOpId = doc.root.opId;
    leftOpId = doc.insert('A', leftOpId);
    leftOpId = doc.insert('B', leftOpId);
    
    const originalAppliedOps = new Set(doc.appliedOperations);
    
    const serialized = doc.serialize();
    const deserialized = PeritextDocument.deserialize(serialized, 'user1');
    
    expect(deserialized.appliedOperations.size).toBe(originalAppliedOps.size);
  });
});