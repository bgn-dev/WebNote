/**
 * CRDT Deterministic Ordering Tests
 * Tests that concurrent inserts at the same position produce consistent, deterministic results
 * regardless of operation application order
 */

import PeritextDocument from '../../../components/crdt/peritext-document';

describe('CRDT Deterministic Ordering', () => {
  test('deterministic ordering with simultaneous inserts at same position - same timestamp', () => {
    const aliceDoc = new PeritextDocument('alice');
    const bobDoc = new PeritextDocument('bob');
    
    // Use exact same timestamp to force tie-breaking by userId
    const timestamp = Date.now();
    
    // Both insert at root position (same leftId) with SAME timestamp
    const aliceOpId = aliceDoc.insert('A', aliceDoc.root.opId);
    const bobOpId = bobDoc.insert('B', bobDoc.root.opId);
    
    // Create operations with same timestamp and same leftId (conflict scenario)
    const aliceOp = {
      action: 'insert',
      opId: aliceOpId,
      char: 'A',
      leftId: aliceDoc.root.opId,
      userId: 'alice',
      counter: 1,
      timestamp: timestamp  // Same timestamp!
    };
    
    const bobOp = {
      action: 'insert',
      opId: bobOpId,
      char: 'B', 
      leftId: bobDoc.root.opId,
      userId: 'bob',
      counter: 1,
      timestamp: timestamp  // Same timestamp!
    };
    
    // Apply in BOTH orders and verify convergence
    // Order 1: Alice first, then Bob
    const doc1 = new PeritextDocument('test1');
    doc1.applyOperation(aliceOp);
    doc1.applyOperation(bobOp);
    
    // Order 2: Bob first, then Alice  
    const doc2 = new PeritextDocument('test2');
    doc2.applyOperation(bobOp);
    doc2.applyOperation(aliceOp);
    
    console.log('Doc1 after Alice->Bob:', doc1.getText());
    console.log('Doc2 after Bob->Alice:', doc2.getText());
    
    // SHOULD BE: Both docs show "AB" (alice < bob lexicographically)
    expect(doc1.getText()).toBe('AB');
    expect(doc2.getText()).toBe('AB');
    expect(doc1.getText()).toBe(doc2.getText()); // Convergence test
  });

  test('deterministic ordering with different timestamps', () => {
    const aliceDoc = new PeritextDocument('alice');
    const bobDoc = new PeritextDocument('bob');
    
    const baseTime = Date.now();
    
    const aliceOpId = aliceDoc.insert('A', aliceDoc.root.opId);
    const bobOpId = bobDoc.insert('B', bobDoc.root.opId);
    
    // Alice has earlier timestamp (should come first regardless of userId)
    const aliceOp = {
      action: 'insert',
      opId: aliceOpId,
      char: 'A',
      leftId: aliceDoc.root.opId,
      userId: 'alice',
      counter: 1,
      timestamp: baseTime
    };
    
    const bobOp = {
      action: 'insert',
      opId: bobOpId,
      char: 'B', 
      leftId: bobDoc.root.opId,
      userId: 'bob',
      counter: 1,
      timestamp: baseTime + 100  // Later timestamp
    };
    
    const doc1 = new PeritextDocument('test1');
    doc1.applyOperation(aliceOp);
    doc1.applyOperation(bobOp);
    
    const doc2 = new PeritextDocument('test2');
    doc2.applyOperation(bobOp);
    doc2.applyOperation(aliceOp);
    
    // Earlier timestamp wins: Alice's 'A' should come first
    expect(doc1.getText()).toBe('AB');
    expect(doc2.getText()).toBe('AB');
    expect(doc1.getText()).toBe(doc2.getText());
  });

  test('deterministic ordering with three users at same position', () => {
    const timestamp = Date.now();
    
    // Create operations from alice, bob, charlie all inserting at root
    const operations = [
      {
        action: 'insert',
        opId: '1@alice',
        char: 'A',
        leftId: '0@root',
        userId: 'alice',
        counter: 1,
        timestamp: timestamp
      },
      {
        action: 'insert',
        opId: '1@bob',
        char: 'B',
        leftId: '0@root',
        userId: 'bob',
        counter: 1,
        timestamp: timestamp
      },
      {
        action: 'insert',
        opId: '1@charlie',
        char: 'C',
        leftId: '0@root',
        userId: 'charlie',
        counter: 1,
        timestamp: timestamp
      }
    ];
    
    // Try all 6 possible application orders
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], 
      [1, 2, 0], [2, 0, 1], [2, 1, 0]
    ];
    
    const results = [];
    
    for (const perm of permutations) {
      const doc = new PeritextDocument('test');
      perm.forEach(i => doc.applyOperation(operations[i]));
      results.push(doc.getText());
    }
    
    console.log('All permutation results:', results);
    
    // All results should be identical (lexicographic order: alice < bob < charlie)
    const expected = 'ABC';
    results.forEach((result, i) => {
      expect(result).toBe(expected);
    });
    
    // Check that all are the same
    const allSame = results.every(result => result === results[0]);
    expect(allSame).toBe(true);
  });

  test('verify RGA ordering is working with mixed timestamps', () => {
    const doc = new PeritextDocument('test');
    
    // Create a mixed scenario: some operations with same timestamp, some different
    const operations = [
      // Group 1: Same timestamp, different users
      {
        action: 'insert',
        opId: '1@zoe',
        char: 'Z',
        leftId: '0@root',
        userId: 'zoe',
        counter: 1,
        timestamp: 1000
      },
      {
        action: 'insert',
        opId: '1@alice',
        char: 'A',
        leftId: '0@root',
        userId: 'alice',
        counter: 1,
        timestamp: 1000  // Same as zoe
      },
      // Group 2: Earlier timestamp (should come first)
      {
        action: 'insert',
        opId: '1@bob',
        char: 'B',
        leftId: '0@root',
        userId: 'bob',
        counter: 1,
        timestamp: 500  // Earlier
      }
    ];
    
    // Apply in reverse chronological order
    operations.reverse().forEach(op => doc.applyOperation(op));
    
    // Expected order: Bob (earliest timestamp), then Alice, then Zoe (lexicographic)
    expect(doc.getText()).toBe('BAZ');
    
    console.log('Mixed timestamp result:', doc.getText());
    console.log('Expected: BAZ (bob=500ms first, then alice<zoe at 1000ms)');
  });

  test('conflict resolution with complex insertion patterns', () => {
    const timestamp = Date.now();
    
    // Test case: multiple users inserting sequences at the same position
    const doc1 = new PeritextDocument('test1');
    const doc2 = new PeritextDocument('test2');
    const doc3 = new PeritextDocument('test3');
    
    // Create operations where each user inserts a sequence at root
    const aliceOps = ['H', 'i'].map((char, i) => ({
      action: 'insert',
      opId: `${i + 1}@alice`,
      char,
      leftId: i === 0 ? '0@root' : `${i}@alice`,
      userId: 'alice',
      counter: i + 1,
      timestamp: timestamp
    }));
    
    const bobOps = ['B', 'y', 'e'].map((char, i) => ({
      action: 'insert',
      opId: `${i + 1}@bob`,
      char,
      leftId: i === 0 ? '0@root' : `${i}@bob`,
      userId: 'bob',
      counter: i + 1,
      timestamp: timestamp
    }));
    
    const charlieOps = ['!'].map((char, i) => ({
      action: 'insert',
      opId: `${i + 1}@charlie`,
      char,
      leftId: '0@root',
      userId: 'charlie',
      counter: i + 1,
      timestamp: timestamp
    }));
    
    // Apply operations in different orders in each document
    // Doc1: Alice, Bob, Charlie
    [...aliceOps, ...bobOps, ...charlieOps].forEach(op => doc1.applyOperation(op));
    
    // Doc2: Charlie, Alice, Bob  
    [...charlieOps, ...aliceOps, ...bobOps].forEach(op => doc2.applyOperation(op));
    
    // Doc3: Bob, Charlie, Alice
    [...bobOps, ...charlieOps, ...aliceOps].forEach(op => doc3.applyOperation(op));
    
    // All should converge to same result
    const result1 = doc1.getText();
    const result2 = doc2.getText();
    const result3 = doc3.getText();
    
    console.log('Complex pattern results:', [result1, result2, result3]);
    
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
    
    // Should preserve user intent while maintaining deterministic order
    expect(result1).toContain('Hi'); // Alice's sequence preserved
    expect(result1).toContain('Bye'); // Bob's sequence preserved
    expect(result1).toContain('!'); // Charlie's character preserved
  });

  test('timestamp tie-breaking with nanosecond precision', () => {
    const baseTimestamp = Date.now();
    
    // Operations with very close timestamps (simulating near-simultaneous edits)
    const operations = [
      {
        action: 'insert',
        opId: '1@user_zebra',
        char: 'Z',
        leftId: '0@root',
        userId: 'user_zebra',
        counter: 1,
        timestamp: baseTimestamp
      },
      {
        action: 'insert',
        opId: '1@user_alpha',
        char: 'A',
        leftId: '0@root',
        userId: 'user_alpha',
        counter: 1,
        timestamp: baseTimestamp  // Exact same timestamp
      },
      {
        action: 'insert',
        opId: '1@user_beta',
        char: 'B',
        leftId: '0@root',
        userId: 'user_beta',
        counter: 1,
        timestamp: baseTimestamp + 1  // 1ms later
      }
    ];
    
    // Test multiple application orders
    const orders = [
      [0, 1, 2], // zebra, alpha, beta
      [2, 1, 0], // beta, alpha, zebra  
      [1, 2, 0]  // alpha, beta, zebra
    ];
    
    const results = orders.map(order => {
      const doc = new PeritextDocument('test');
      order.forEach(i => doc.applyOperation(operations[i]));
      return doc.getText();
    });
    
    console.log('Timestamp tie-breaking results:', results);
    
    // All should be identical: earlier timestamp first, then lexicographic
    // Expected: user_alpha and user_zebra at same timestamp -> A then Z
    // Then user_beta at later timestamp -> B at end = "AZB"
    const expected = 'AZB';
    results.forEach(result => {
      expect(result).toBe(expected);
    });
  });

  test('deterministic ordering survives document serialization', () => {
    const timestamp = Date.now();
    
    // Create operations that would conflict
    const conflictOps = [
      {
        action: 'insert',
        opId: '1@user_y',
        char: 'Y',
        leftId: '0@root',
        userId: 'user_y',
        counter: 1,
        timestamp: timestamp
      },
      {
        action: 'insert',
        opId: '1@user_x',
        char: 'X',
        leftId: '0@root',
        userId: 'user_x',
        counter: 1,
        timestamp: timestamp
      }
    ];
    
    // Apply operations to document
    const doc = new PeritextDocument('test');
    conflictOps.forEach(op => doc.applyOperation(op));
    
    const textBeforeSerialization = doc.getText();
    
    // Serialize and deserialize
    const serialized = doc.serialize();
    const deserialized = PeritextDocument.deserialize(serialized, 'test');
    
    const textAfterSerialization = deserialized.getText();
    
    // Text should be identical and deterministic
    expect(textAfterSerialization).toBe(textBeforeSerialization);
    expect(textAfterSerialization).toBe('XY'); // user_x < user_y lexicographically
    
    console.log('Serialization preservation test:', {
      before: textBeforeSerialization,
      after: textAfterSerialization
    });
  });
});