/**
 * Tests focused on CRDT convergence and consistency issues
 * These tests help diagnose problems found in basic tests
 */

import PeritextDocument from '../../../components/crdt/peritext-document';

describe('CRDT Convergence Analysis', () => {
  describe('Deterministic Ordering Investigation', () => {
    test('examines how concurrent operations are ordered', () => {
      const doc1 = new PeritextDocument('user1');
      const doc2 = new PeritextDocument('user2');
      
      // Create operations that insert at same logical position
      const op1 = {
        opId: '1@user1',
        char: 'A',
        leftId: doc1.root.opId,
        action: 'insert',
        timestamp: 1000,
        userId: 'user1',
        counter: 1
      };
      
      const op2 = {
        opId: '1@user2', 
        char: 'B',
        leftId: doc2.root.opId,
        action: 'insert',
        timestamp: 1001, // Slightly later
        userId: 'user2',
        counter: 1
      };
      
      // Apply in different orders
      doc1.applyOperation(op1);
      doc1.applyOperation(op2);
      
      doc2.applyOperation(op2);
      doc2.applyOperation(op1);
      
      const text1 = doc1.getText();
      const text2 = doc2.getText();
      
      console.log('Doc1 result:', text1);
      console.log('Doc2 result:', text2);
      console.log('Converged:', text1 === text2);
      
      // Log the actual sequences to understand ordering
      const seq1 = doc1.getOrderedSequence();
      const seq2 = doc2.getOrderedSequence();
      
      console.log('Doc1 sequence:', seq1.map(n => n.char).filter(c => c));
      console.log('Doc2 sequence:', seq2.map(n => n.char).filter(c => c));
    });

    test('investigates tie-breaking mechanism', () => {
      const doc = new PeritextDocument('test');
      
      // Create two operations with same leftId but different userIds
      const opA = {
        opId: '1@alice',
        char: 'A',
        leftId: doc.root.opId,
        action: 'insert',
        timestamp: 1000,
        userId: 'alice',
        counter: 1
      };
      
      const opB = {
        opId: '1@bob',
        char: 'B', 
        leftId: doc.root.opId,
        action: 'insert',
        timestamp: 1000, // Same timestamp
        userId: 'bob',
        counter: 1
      };
      
      doc.applyOperation(opA);
      doc.applyOperation(opB);
      
      const sequence = doc.getOrderedSequence();
      const characters = sequence.filter(n => n.char).map(n => n.char);
      
      console.log('Characters in order:', characters);
      console.log('Expected deterministic ordering based on userId lexicographic order');
      
      // In a properly implemented CRDT, this should be deterministic
      // Usually lexicographic ordering of userIds is used as tie-breaker
      expect(characters).toEqual(['A', 'B']); // alice < bob lexicographically
    });
  });

  describe('Operation Application Deep Dive', () => {
    test('traces operation application step by step', () => {
      const doc = new PeritextDocument('user1');
      
      console.log('Initial state:', {
        text: doc.getText(),
        characters: doc.characters.size,
        root: doc.root.opId
      });
      
      // Insert first character
      const opId1 = doc.insert('H', doc.root.opId);
      console.log('After inserting H:', {
        text: doc.getText(),
        opId: opId1,
        characters: Array.from(doc.characters.keys())
      });
      
      // Insert second character  
      const opId2 = doc.insert('i', opId1);
      console.log('After inserting i:', {
        text: doc.getText(),
        opId: opId2,
        sequence: doc.getOrderedSequence().map(n => ({ opId: n.opId, char: n.char }))
      });
      
      expect(doc.getText()).toBe('Hi');
    });

    test('examines concurrent insert resolution', () => {
      const doc1 = new PeritextDocument('alice');
      const doc2 = new PeritextDocument('bob');
      
      // Alice inserts 'A'
      doc1.insert('A', doc1.root.opId);
      const aliceOp = {
        opId: '1@alice',
        char: 'A',
        leftId: doc1.root.opId,
        action: 'insert',
        timestamp: Date.now(),
        userId: 'alice',
        counter: 1
      };
      
      // Bob inserts 'B' at same position
      doc2.insert('B', doc2.root.opId);
      const bobOp = {
        opId: '1@bob',
        char: 'B',
        leftId: doc2.root.opId,
        action: 'insert', 
        timestamp: Date.now(),
        userId: 'bob',
        counter: 1
      };
      
      console.log('Before sync - Alice:', doc1.getText(), 'Bob:', doc2.getText());
      
      // Sync operations
      doc1.applyOperation(bobOp);
      doc2.applyOperation(aliceOp);
      
      console.log('After sync - Alice:', doc1.getText(), 'Bob:', doc2.getText());
      
      const seq1 = doc1.getOrderedSequence().filter(n => n.char).map(n => n.char);
      const seq2 = doc2.getOrderedSequence().filter(n => n.char).map(n => n.char);
      
      console.log('Alice sequence:', seq1);
      console.log('Bob sequence:', seq2);
      
      // They should converge to same result
      expect(doc1.getText()).toBe(doc2.getText());
    });
  });

  describe('Delete Operation Investigation', () => {
    test('examines delete operation behavior', () => {
      const doc = new PeritextDocument('user1');
      
      // Build "Hello"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'Hello') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }
      
      console.log('Before delete:', {
        text: doc.getText(),
        sequence: doc.getOrderedSequence().map(n => ({ opId: n.opId, char: n.char, deleted: n.deleted }))
      });
      
      // Try to delete 'H' (first character)
      const hOpId = opIds[0]; // Should be '1@user1'
      const deleteOp = {
        action: 'delete',
        targetId: hOpId,
        timestamp: Date.now(),
        userId: 'user1',
        counter: doc.counter + 1
      };
      
      doc.applyRemoteDelete(deleteOp);
      
      console.log('After deleting H:', {
        text: doc.getText(),
        sequence: doc.getOrderedSequence().map(n => ({ opId: n.opId, char: n.char, deleted: n.deleted }))
      });
      
      expect(doc.getText()).toBe('ello');
    });

    test('verifies tombstone preservation', () => {
      const doc = new PeritextDocument('user1');
      
      const opId = doc.insert('X', doc.root.opId);
      expect(doc.getText()).toBe('X');
      
      // Delete the character
      const deleteOp = {
        action: 'delete',
        targetId: opId,
        timestamp: Date.now(),
        userId: 'user1',
        counter: 2
      };
      
      doc.applyRemoteDelete(deleteOp);
      
      // Character should be marked as deleted but still exist in structure
      const character = doc.characters.get(opId);
      expect(character).toBeTruthy();
      expect(character.deleted).toBe(true);
      expect(doc.getText()).toBe(''); // Not in visible text
    });
  });
});

describe('CRDT Property Verification', () => {
  test('verifies idempotence - applying same operation twice', () => {
    const doc = new PeritextDocument('user1');
    
    const operation = {
      opId: '1@remote',
      char: 'A',
      leftId: doc.root.opId,
      action: 'insert',
      timestamp: Date.now(),
      userId: 'remote',
      counter: 1
    };
    
    const result1 = doc.applyOperation(operation);
    const text1 = doc.getText();
    
    const result2 = doc.applyOperation(operation); // Same operation again
    const text2 = doc.getText();
    
    expect(result1).not.toBe(false); // First application succeeds
    expect(result2).toBe(false); // Second application is rejected
    expect(text1).toBe(text2); // Text unchanged
    expect(text1).toBe('A');
  });

  test('verifies commutativity - operation order independence', () => {
    const operation1 = {
      opId: '1@user1',
      char: 'A', 
      leftId: '0@root',
      action: 'insert',
      timestamp: 1000,
      userId: 'user1',
      counter: 1
    };
    
    const operation2 = {
      opId: '1@user2',
      char: 'B',
      leftId: '0@root', 
      action: 'insert',
      timestamp: 1001,
      userId: 'user2',
      counter: 1
    };
    
    // Apply in order A, then B
    const doc1 = new PeritextDocument('test1');
    doc1.applyOperation(operation1);
    doc1.applyOperation(operation2);
    
    // Apply in order B, then A
    const doc2 = new PeritextDocument('test2');  
    doc2.applyOperation(operation2);
    doc2.applyOperation(operation1);
    
    const text1 = doc1.getText();
    const text2 = doc2.getText();
    
    console.log('Order A,B result:', text1);
    console.log('Order B,A result:', text2);
    
    expect(text1).toBe(text2); // Should be commutative
  });
});