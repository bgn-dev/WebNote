/**
 * CRDT Serialization Tests  
 * Tests document persistence: serialization, deserialization, and state preservation
 */

import PeritextDocument from '../../../features/collaboration/lib/crdt/peritext-document';

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

  test('serialization preserves complex document structure', () => {
    const doc = new PeritextDocument('user1');
    
    // Create complex content with insertions and deletions
    let leftOpId = doc.root.opId;
    const opIds = [];
    
    // Insert "Hello World"
    for (const char of 'Hello World') {
      leftOpId = doc.insert(char, leftOpId);
      opIds.push(leftOpId);
    }
    
    // Delete some characters to create gaps
    const sequence = doc.getOrderedSequence();
    const deleteOps = [
      doc.createOperation('delete', { targetId: sequence[1].opId }), // Delete 'e'
      doc.createOperation('delete', { targetId: sequence[6].opId })  // Delete 'W'
    ];
    
    deleteOps.forEach(op => doc.applyRemoteDelete(op));
    
    const originalText = doc.getText(); // Should be "Hllo orld"
    const originalCharCount = doc.characters.size;
    const originalCounter = doc.counter;
    
    // Serialize and deserialize
    const serialized = doc.serialize();
    const deserialized = PeritextDocument.deserialize(serialized, 'user1');
    
    // Verify everything is preserved
    expect(deserialized.getText()).toBe(originalText);
    expect(deserialized.characters.size).toBe(originalCharCount);
    expect(deserialized.counter).toBe(originalCounter);
    expect(deserialized.userId).toBe('user1');
    
    // Verify deleted characters are still marked as deleted
    const deserializedSequence = deserialized.getOrderedSequence();
    const deletedNodes = Array.from(deserialized.characters.values()).filter(node => node.deleted);
    expect(deletedNodes.length).toBe(2); // Two deleted characters
  });

  test('deserialized document can continue to accept operations', () => {
    const doc1 = new PeritextDocument('user1');
    const doc2 = new PeritextDocument('user2');
    
    // Build initial content in doc1
    let leftOpId = doc1.root.opId;
    for (const char of 'Hello') {
      leftOpId = doc1.insert(char, leftOpId);
    }
    
    // Serialize and deserialize doc1
    const serialized = doc1.serialize();
    const deserializedDoc1 = PeritextDocument.deserialize(serialized, 'user1');
    
    expect(deserializedDoc1.getText()).toBe('Hello');
    
    // FIXED: Simulate realistic Lamport counter behavior
    // In real scenario, doc2 would have received doc1's operations first
    // and updated its counter to max(local, 5) before creating new ops

    // Simulate doc2 receiving doc1's state (counter would be updated to 5)
    doc2.counter = Math.max(doc2.counter, 5);

    // Now doc2 creates operations for " World" with counters 6-11
    let leftOpId2 = doc2.root.opId;
    const remoteOps = [];
    for (const char of ' World') {
      const opId = doc2.insert(char, leftOpId2);
      const node = doc2.characters.get(opId);
      remoteOps.push({
        action: 'insert',
        opId: opId,
        char: char,
        leftId: leftOpId2,
        userId: node.userId,
        counter: node.counter
      });
      leftOpId2 = opId;
    }
    
    // Apply the remote operations to the deserialized document
    remoteOps.forEach(op => {
      const result = deserializedDoc1.applyOperation(op);
      expect(result).not.toBe(false);
    });

    // The deserialized document should now include the new content
    const finalText = deserializedDoc1.getText();
    console.log('Final text after deserialization:', finalText);
    console.log('Counter after operations:', deserializedDoc1.counter);
    expect(finalText.includes('Hello')).toBe(true);
    expect(finalText.includes('World')).toBe(true);
  });

  test('serialization handles empty document correctly', () => {
    const doc = new PeritextDocument('user1');
    
    // Don't add any content
    expect(doc.getText()).toBe('');
    
    const serialized = doc.serialize();
    const deserialized = PeritextDocument.deserialize(serialized, 'user1');
    
    expect(deserialized.getText()).toBe('');
    expect(deserialized.userId).toBe('user1');
    expect(deserialized.counter).toBe(0);
    expect(deserialized.characters.size).toBe(1); // Just the root node
    expect(deserialized.root.opId).toBe('0@root');
  });

  test('serialization preserves marks and formatting', () => {
    const doc = new PeritextDocument('user1');
    
    // Build some content
    let leftOpId = doc.root.opId;
    const opIds = [];
    for (const char of 'Bold Text') {
      leftOpId = doc.insert(char, leftOpId);
      opIds.push(leftOpId);
    }
    
    // Add a mark (if marks are supported)
    if (doc.addMark && opIds.length >= 4) {
      const startAnchor = { opId: opIds[0], type: 'start' };
      const endAnchor = { opId: opIds[3], type: 'end' };
      doc.addMark(startAnchor, endAnchor, 'bold', { weight: 'bold' }); // Mark "Bold"
    }
    
    const serialized = doc.serialize();
    const deserialized = PeritextDocument.deserialize(serialized, 'user1');
    
    expect(deserialized.getText()).toBe('Bold Text');
    
    // If marks are supported, verify they're preserved
    if (doc.marks && deserialized.marks) {
      expect(deserialized.marks.size).toBe(doc.marks.size);
    }
  });

  test('multiple serialize/deserialize cycles preserve data integrity', () => {
    const doc = new PeritextDocument('user1');
    
    // Build content
    let leftOpId = doc.root.opId;
    for (const char of 'Cycle Test') {
      leftOpId = doc.insert(char, leftOpId);
    }
    
    let currentDoc = doc;
    const originalText = currentDoc.getText();
    
    // Perform multiple serialize/deserialize cycles
    for (let i = 0; i < 3; i++) {
      const serialized = currentDoc.serialize();
      currentDoc = PeritextDocument.deserialize(serialized, 'user1');
      
      // Text should remain identical through all cycles
      expect(currentDoc.getText()).toBe(originalText);
      expect(currentDoc.userId).toBe('user1');
    }
  });

  test('serialized format is stable and predictable', () => {
    const doc1 = new PeritextDocument('user1');
    const doc2 = new PeritextDocument('user1');
    
    // Build identical content in both documents
    const content = 'Stable';
    let leftOpId1 = doc1.root.opId;
    let leftOpId2 = doc2.root.opId;
    
    for (const char of content) {
      leftOpId1 = doc1.insert(char, leftOpId1);
      leftOpId2 = doc2.insert(char, leftOpId2);
    }
    
    const serialized1 = doc1.serialize();
    const serialized2 = doc2.serialize();
    
    // Serialized representations should be equivalent for identical documents
    expect(JSON.stringify(serialized1)).toBe(JSON.stringify(serialized2));
    
    // Both should deserialize to identical documents
    const deserialized1 = PeritextDocument.deserialize(serialized1, 'user1');
    const deserialized2 = PeritextDocument.deserialize(serialized2, 'user1');
    
    expect(deserialized1.getText()).toBe(deserialized2.getText());
    expect(deserialized1.characters.size).toBe(deserialized2.characters.size);
  });
});