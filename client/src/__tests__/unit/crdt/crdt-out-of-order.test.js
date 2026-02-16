/**
 * Test for out-of-order operation delivery (Bug Fix #1)
 * Verifies that operation buffering correctly handles missing dependencies
 */

import PeritextDocument from '../../../features/collaboration/lib/crdt/peritext-document';

describe('CRDT Out-of-Order Operation Delivery', () => {
  test('handles operations arriving out of order (buffering test)', () => {
    // Simulate two users
    const docAlice = new PeritextDocument('alice');
    const docBob = new PeritextDocument('bob');

    // Alice types "ABC" sequentially
    const op1 = {
      action: 'insert',
      opId: '1@alice',
      char: 'A',
      leftId: docAlice.root.opId,
      timestamp: Date.now(),
      userId: 'alice',
      counter: 1
    };

    const op2 = {
      action: 'insert',
      opId: '2@alice',
      char: 'B',
      leftId: '1@alice', // Depends on op1
      timestamp: Date.now() + 1,
      userId: 'alice',
      counter: 2
    };

    const op3 = {
      action: 'insert',
      opId: '3@alice',
      char: 'C',
      leftId: '2@alice', // Depends on op2
      timestamp: Date.now() + 2,
      userId: 'alice',
      counter: 3
    };

    // Apply locally to Alice
    docAlice.applyOperation(op1);
    docAlice.applyOperation(op2);
    docAlice.applyOperation(op3);

    expect(docAlice.getText()).toBe('ABC');

    // Bob receives operations OUT OF ORDER: op3, op1, op2
    console.log('\n--- Simulating out-of-order delivery to Bob ---');

    // Op3 arrives first (should be buffered - missing op2)
    docBob.applyOperation(op3);
    console.log('After op3:', docBob.getText());
    expect(docBob.getText()).toBe(''); // Nothing visible yet (op3 is buffered)
    expect(docBob.pendingOperations.length).toBe(1); // Op3 is pending

    // Op1 arrives second (can be applied)
    docBob.applyOperation(op1);
    console.log('After op1:', docBob.getText());
    expect(docBob.getText()).toBe('A'); // Only 'A' visible
    expect(docBob.pendingOperations.length).toBe(1); // Op3 still pending (still missing op2)

    // Op2 arrives last (triggers chain application)
    docBob.applyOperation(op2);
    console.log('After op2:', docBob.getText());

    // Now all operations should be applied!
    expect(docBob.getText()).toBe('ABC');
    expect(docBob.pendingOperations.length).toBe(0); // All operations processed

    // Verify convergence
    expect(docBob.getText()).toBe(docAlice.getText());
  });

  test('handles deeply nested dependencies', () => {
    const doc = new PeritextDocument('user1');

    // Create a chain: op1 -> op2 -> op3 -> op4 -> op5
    const operations = [
      { action: 'insert', opId: '1@user2', char: 'A', leftId: doc.root.opId, userId: 'user2', counter: 1, timestamp: Date.now() },
      { action: 'insert', opId: '2@user2', char: 'B', leftId: '1@user2', userId: 'user2', counter: 2, timestamp: Date.now() + 1 },
      { action: 'insert', opId: '3@user2', char: 'C', leftId: '2@user2', userId: 'user2', counter: 3, timestamp: Date.now() + 2 },
      { action: 'insert', opId: '4@user2', char: 'D', leftId: '3@user2', userId: 'user2', counter: 4, timestamp: Date.now() + 3 },
      { action: 'insert', opId: '5@user2', char: 'E', leftId: '4@user2', userId: 'user2', counter: 5, timestamp: Date.now() + 4 }
    ];

    // Apply in REVERSE order (worst case)
    for (let i = operations.length - 1; i >= 0; i--) {
      console.log(`\nApplying ${operations[i].opId} (char: "${operations[i].char}")`);
      doc.applyOperation(operations[i]);
      console.log(`Text: "${doc.getText()}", Pending: ${doc.pendingOperations.length}`);
    }

    // All should be applied eventually
    expect(doc.getText()).toBe('ABCDE');
    expect(doc.pendingOperations.length).toBe(0);
  });

  test('handles interleaved operations from multiple users', () => {
    const doc = new PeritextDocument('observer');

    // User1 types "ABC", User2 types "123"
    const user1Ops = [
      { action: 'insert', opId: '1@user1', char: 'A', leftId: doc.root.opId, userId: 'user1', counter: 1, timestamp: 1000 },
      { action: 'insert', opId: '2@user1', char: 'B', leftId: '1@user1', userId: 'user1', counter: 2, timestamp: 1002 },
      { action: 'insert', opId: '3@user1', char: 'C', leftId: '2@user1', userId: 'user1', counter: 3, timestamp: 1004 }
    ];

    const user2Ops = [
      { action: 'insert', opId: '1@user2', char: '1', leftId: doc.root.opId, userId: 'user2', counter: 1, timestamp: 1001 },
      { action: 'insert', opId: '2@user2', char: '2', leftId: '1@user2', userId: 'user2', counter: 2, timestamp: 1003 },
      { action: 'insert', opId: '3@user2', char: '3', leftId: '2@user2', userId: 'user2', counter: 3, timestamp: 1005 }
    ];

    // Interleaved arrival: user1[0], user2[2], user1[2], user2[0], user1[1], user2[1]
    const arrivalOrder = [
      user1Ops[0], // 1@user1 'A'
      user2Ops[2], // 3@user2 '3' (buffered - missing 1@user2 and 2@user2)
      user1Ops[2], // 3@user1 'C' (buffered - missing 2@user1)
      user2Ops[0], // 1@user2 '1'
      user1Ops[1], // 2@user1 'B' (triggers 3@user1)
      user2Ops[1]  // 2@user2 '2' (triggers 3@user2)
    ];

    arrivalOrder.forEach(op => {
      console.log(`\nApplying ${op.opId} (char: "${op.char}")`);
      doc.applyOperation(op);
      console.log(`Text: "${doc.getText()}", Pending: ${doc.pendingOperations.length}`);
    });

    // All operations should be applied
    expect(doc.pendingOperations.length).toBe(0);

    // Result should be deterministic (RGA ordering)
    const text = doc.getText();
    console.log(`\nFinal text: "${text}"`);

    // Should contain all characters
    expect(text).toContain('A');
    expect(text).toContain('B');
    expect(text).toContain('C');
    expect(text).toContain('1');
    expect(text).toContain('2');
    expect(text).toContain('3');
    expect(text.length).toBe(6);
  });

  test('does not apply duplicate operations', () => {
    const doc = new PeritextDocument('user1');

    const op = {
      action: 'insert',
      opId: '1@user2',
      char: 'X',
      leftId: doc.root.opId,
      userId: 'user2',
      counter: 1,
      timestamp: Date.now()
    };

    // Apply same operation multiple times
    doc.applyOperation(op);
    doc.applyOperation(op);
    doc.applyOperation(op);

    // Should only appear once
    expect(doc.getText()).toBe('X');
    expect(doc.characters.size).toBe(2); // root + 'X'
  });
});
