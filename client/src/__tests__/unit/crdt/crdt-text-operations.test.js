/**
 * CRDT Text Operations Tests
 * Tests text-level abstractions: indexing, cursor positioning, and text utilities
 */

import PeritextDocument from '../../../components/crdt/peritext-document';

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

  test('getTextIndexForOperation handles deleted characters correctly', () => {
    const doc = new PeritextDocument('user1');
    
    // Build "Hello"
    let leftOpId = doc.root.opId;
    const opIds = [];
    for (const char of 'Hello') {
      leftOpId = doc.insert(char, leftOpId);
      opIds.push(leftOpId);
    }
    
    // Delete middle character 'l' (index 2)
    const sequence = doc.getOrderedSequence();
    const deleteOp = doc.createOperation('delete', {
      targetId: sequence[2].opId // First 'l'
    });
    doc.applyRemoteDelete(deleteOp);
    
    expect(doc.getText()).toBe('Helo');
    
    // Test that remaining characters have correct text indices
    [
      { opId: opIds[0], expectedIndex: 0 }, // 'H'
      { opId: opIds[1], expectedIndex: 1 }, // 'e'  
      { opId: opIds[3], expectedIndex: 2 }, // second 'l' (now at index 2)
      { opId: opIds[4], expectedIndex: 3 }  // 'o'
    ].forEach(({ opId, expectedIndex }) => {
      const operation = { opId, action: 'insert' };
      const textIndex = doc.getTextIndexForOperation(operation);
      expect(textIndex).toBe(expectedIndex);
    });
  });

  test('getLeftOpIdForCursor handles cursor positions in modified text', () => {
    const doc = new PeritextDocument('user1');
    
    // Build "Hello World"
    let leftOpId = doc.root.opId;
    const opIds = [doc.root.opId];
    for (const char of 'Hello World') {
      leftOpId = doc.insert(char, leftOpId);
      opIds.push(leftOpId);
    }
    
    expect(doc.getText()).toBe('Hello World');
    
    // Test various cursor positions
    expect(doc.getLeftOpIdForCursor(0)).toBe(doc.root.opId); // Before 'H'
    expect(doc.getLeftOpIdForCursor(5)).toBe(opIds[5]); // After 'o', before ' '
    expect(doc.getLeftOpIdForCursor(6)).toBe(opIds[6]); // After ' ', before 'W'
    expect(doc.getLeftOpIdForCursor(11)).toBe(opIds[11]); // After 'd' (end)
  });

  test('cursor positioning works correctly with concurrent edits', () => {
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
    
    const leftOpId2 = '5@shared'; // Last character of "Hello"
    
    expect(doc1.getText()).toBe('Hello');
    expect(doc2.getText()).toBe('Hello');
    
    // User1 inserts " World" at the end
    let currentLeftId = leftOpId2;
    const worldOps = [];
    for (let i = 0; i < ' World'.length; i++) {
      const char = ' World'[i];
      const opId = `${i + 1}@user1`;
      
      doc1.insert(char, currentLeftId);
      
      const op = {
        action: 'insert',
        opId: opId,
        char: char,
        leftId: currentLeftId,
        userId: 'user1',
        counter: i + 1,
        timestamp: Date.now() + i
      };
      worldOps.push(op);
      currentLeftId = opId;
    }
    
    // User2 inserts "!" at the end (before seeing User1's changes)
    const exclamationOp = {
      action: 'insert',
      opId: '1@user2',
      char: '!',
      leftId: leftOpId2, // At end of "Hello"
      userId: 'user2',
      counter: 1,
      timestamp: Date.now()
    };
    
    doc2.insert('!', leftOpId2);
    
    expect(doc1.getText()).toBe('Hello World');
    expect(doc2.getText()).toBe('Hello!');
    
    // Apply remote operations
    worldOps.forEach(op => doc2.applyOperation(op));
    doc1.applyOperation(exclamationOp);
    
    // Both should converge
    expect(doc1.getText()).toBe(doc2.getText());
    
    // Test that cursor positioning still works correctly
    const finalText = doc1.getText();
    
    // Should be able to place cursor at any position
    for (let i = 0; i <= finalText.length; i++) {
      const leftOpId = doc1.getLeftOpIdForCursor(i);
      expect(leftOpId).toBeTruthy();
    }
  });

  test('text indexing remains consistent after complex operations', () => {
    const doc = new PeritextDocument('user1');
    
    // Build initial text "ABCDEF"
    let leftOpId = doc.root.opId;
    const chars = 'ABCDEF';
    const opIds = [];
    
    for (const char of chars) {
      leftOpId = doc.insert(char, leftOpId);
      opIds.push(leftOpId);
    }
    
    expect(doc.getText()).toBe('ABCDEF');
    
    // Delete 'C' and 'E' (indices 2 and 4)
    const sequence = doc.getOrderedSequence();
    
    const deleteCOp = doc.createOperation('delete', {
      targetId: sequence[2].opId // 'C'
    });
    
    const deleteEOp = doc.createOperation('delete', {
      targetId: sequence[4].opId // 'E'
    });
    
    doc.applyRemoteDelete(deleteCOp);
    doc.applyRemoteDelete(deleteEOp);
    
    expect(doc.getText()).toBe('ABDF');
    
    // Verify text indexing for remaining characters
    const remainingChars = ['A', 'B', 'D', 'F'];
    const remainingOpIds = [opIds[0], opIds[1], opIds[3], opIds[5]];
    
    remainingOpIds.forEach((opId, index) => {
      const operation = { opId, action: 'insert' };
      const textIndex = doc.getTextIndexForOperation(operation);
      expect(textIndex).toBe(index);
    });
    
    // Verify cursor positioning
    for (let i = 0; i <= 4; i++) { // 0 to length of "ABDF"
      const leftOpId = doc.getLeftOpIdForCursor(i);
      expect(leftOpId).toBeTruthy();
    }
  });
});