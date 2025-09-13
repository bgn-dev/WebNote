/**
 * CRDT Basic Operations Tests
 * Tests core CRDT functionality: initialization, single character operations, and basic deletions
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