/**
 * CRDT Concurrent Operations Tests
 * Tests multi-user scenarios, conflict resolution, and operation deduplication
 */

import PeritextDocument from '../../../components/crdt/peritext-document';

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

  test('multiple users editing simultaneously maintain consistency', () => {
    const docAlice = new PeritextDocument('alice');
    const docBob = new PeritextDocument('bob');
    const docCharlie = new PeritextDocument('charlie');

    // Each user inserts their initial character
    const aliceOpId = docAlice.insert('A', docAlice.root.opId);
    const bobOpId = docBob.insert('B', docBob.root.opId);  
    const charlieOpId = docCharlie.insert('C', docCharlie.root.opId);

    // Create operations for sharing
    const aliceOp = docAlice.createOperation('insert', {
      opId: aliceOpId,
      char: 'A',
      leftId: docAlice.root.opId
    });

    const bobOp = docBob.createOperation('insert', {
      opId: bobOpId,
      char: 'B',
      leftId: docBob.root.opId
    });

    const charlieOp = docCharlie.createOperation('insert', {
      opId: charlieOpId,
      char: 'C', 
      leftId: docCharlie.root.opId
    });

    // Simulate network: everyone receives everyone else's operations
    // Alice receives Bob and Charlie's operations
    docAlice.applyOperation(bobOp);
    docAlice.applyOperation(charlieOp);

    // Bob receives Alice and Charlie's operations  
    docBob.applyOperation(aliceOp);
    docBob.applyOperation(charlieOp);

    // Charlie receives Alice and Bob's operations
    docCharlie.applyOperation(aliceOp);
    docCharlie.applyOperation(bobOp);

    // All documents should converge to the same state
    const aliceText = docAlice.getText();
    const bobText = docBob.getText();
    const charlieText = docCharlie.getText();

    expect(aliceText).toBe(bobText);
    expect(bobText).toBe(charlieText);
    
    // Should contain all characters in deterministic order
    expect(aliceText).toMatch(/^[ABC]{3}$/); // Contains A, B, C in some order
    expect(aliceText.includes('A')).toBe(true);
    expect(aliceText.includes('B')).toBe(true);
    expect(aliceText.includes('C')).toBe(true);
  });

  test('concurrent delete operations are handled correctly', () => {
    // Setup two documents with same initial shared content
    const doc1 = new PeritextDocument('user1');
    const doc2 = new PeritextDocument('user2');

    // Build "Hello" using shared operations so both docs have identical structure
    const sharedOps = [];
    const chars = 'Hello';
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const opId = `${i + 1}@shared`;
      const op = {
        action: 'insert',
        opId: opId,
        char: char,
        leftId: i === 0 ? '0@root' : `${i}@shared`,
        userId: 'shared',
        counter: i + 1,
        timestamp: Date.now() + i
      };
      sharedOps.push(op);
    }

    // Apply shared operations to both documents
    sharedOps.forEach(op => {
      doc1.applyOperation(op);
      doc2.applyOperation(op);
    });

    expect(doc1.getText()).toBe('Hello');
    expect(doc2.getText()).toBe('Hello');

    // Both users delete different characters using shared opIds
    // User1 deletes 'e' (2@shared)
    const deleteOp1 = {
      action: 'delete',
      targetId: '2@shared', // 'e'
      opId: '1@user1',
      userId: 'user1',
      counter: 1,
      timestamp: Date.now()
    };

    // User2 deletes first 'l' (3@shared)  
    const deleteOp2 = {
      action: 'delete',
      targetId: '3@shared', // first 'l'
      opId: '1@user2',
      userId: 'user2',
      counter: 1,
      timestamp: Date.now()
    };

    // Apply deletions locally first
    doc1.applyOperation(deleteOp1);
    doc2.applyOperation(deleteOp2);

    expect(doc1.getText()).toBe('Hllo'); // 'e' deleted
    expect(doc2.getText()).toBe('Helo'); // first 'l' deleted

    // Apply remote deletions
    doc1.applyOperation(deleteOp2);
    doc2.applyOperation(deleteOp1);

    // Both should converge to same result: 'Hlo' (both 'e' and first 'l' deleted)
    expect(doc1.getText()).toBe(doc2.getText());
    expect(doc1.getText()).toBe('Hlo');
  });
});