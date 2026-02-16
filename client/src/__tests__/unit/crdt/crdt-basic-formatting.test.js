/**
 * CRDT Basic Formatting Tests
 * Tests the 4 basic formatting types: bold, italic, underline, strike
 * Verifies mark operations work correctly in isolation and across network
 */

import PeritextDocument from '../../../features/collaboration/lib/crdt/peritext-document';

describe('PeritextDocument - Basic Formatting', () => {
  let doc;

  beforeEach(() => {
    doc = new PeritextDocument('test-user');
  });

  describe('Single Format Type', () => {
    test('applies bold formatting to text', () => {
      // Insert "Hello"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'Hello') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      expect(doc.getText()).toBe('Hello');

      // Apply bold to "Hello" (all 5 characters)
      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[4], type: 'after' };
      const markId = doc.addMark(startAnchor, endAnchor, 'bold', { bold: true });

      expect(doc.marks.has(markId)).toBe(true);
      expect(doc.marks.get(markId).markType).toBe('bold');

      // Check formatted content
      const formatted = doc.getFormattedContent();
      expect(formatted.ops).toHaveLength(1);
      expect(formatted.ops[0]).toEqual({
        insert: 'Hello',
        attributes: { bold: true }
      });
    });

    test('applies italic formatting to text', () => {
      // Insert "World"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'World') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      // Apply italic to "World"
      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[4], type: 'after' };
      const markId = doc.addMark(startAnchor, endAnchor, 'italic', { italic: true });

      expect(doc.marks.has(markId)).toBe(true);

      const formatted = doc.getFormattedContent();
      expect(formatted.ops[0]).toEqual({
        insert: 'World',
        attributes: { italic: true }
      });
    });

    test('applies underline formatting to text', () => {
      // Insert "Test"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'Test') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      // Apply underline to "Test"
      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[3], type: 'after' };
      const markId = doc.addMark(startAnchor, endAnchor, 'underline', { underline: true });

      expect(doc.marks.has(markId)).toBe(true);

      const formatted = doc.getFormattedContent();
      expect(formatted.ops[0]).toEqual({
        insert: 'Test',
        attributes: { underline: true }
      });
    });

    test('applies strike (strikethrough) formatting to text', () => {
      // Insert "Done"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'Done') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      // Apply strike to "Done"
      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[3], type: 'after' };
      const markId = doc.addMark(startAnchor, endAnchor, 'strike', { strike: true });

      expect(doc.marks.has(markId)).toBe(true);

      const formatted = doc.getFormattedContent();
      expect(formatted.ops[0]).toEqual({
        insert: 'Done',
        attributes: { strike: true }
      });
    });
  });

  describe('Partial Formatting', () => {
    test('applies bold to middle of text', () => {
      // Insert "Hello World"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'Hello World') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      // Apply bold only to "World" (indices 6-10)
      const startAnchor = { opId: opIds[6], type: 'before' };
      const endAnchor = { opId: opIds[10], type: 'after' };
      doc.addMark(startAnchor, endAnchor, 'bold', { bold: true });

      const formatted = doc.getFormattedContent();
      expect(formatted.ops).toHaveLength(2);
      expect(formatted.ops[0]).toEqual({ insert: 'Hello ' });
      expect(formatted.ops[1]).toEqual({
        insert: 'World',
        attributes: { bold: true }
      });
    });

    test('applies formatting to first word only', () => {
      // Insert "Hello World"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'Hello World') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      // Apply italic only to "Hello" (indices 0-4)
      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[4], type: 'after' };
      doc.addMark(startAnchor, endAnchor, 'italic', { italic: true });

      const formatted = doc.getFormattedContent();
      expect(formatted.ops).toHaveLength(2);
      expect(formatted.ops[0]).toEqual({
        insert: 'Hello',
        attributes: { italic: true }
      });
      expect(formatted.ops[1]).toEqual({ insert: ' World' });
    });
  });

  describe('Multiple Formats (Overlapping)', () => {
    test('applies bold and italic to same text', () => {
      // Insert "Bold Italic"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'Bold Italic') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      // Apply bold to "Bold Italic"
      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[10], type: 'after' };
      doc.addMark(startAnchor, endAnchor, 'bold', { bold: true });

      // Apply italic to "Bold Italic"
      doc.addMark(startAnchor, endAnchor, 'italic', { italic: true });

      const formatted = doc.getFormattedContent();
      expect(formatted.ops).toHaveLength(1);
      expect(formatted.ops[0]).toEqual({
        insert: 'Bold Italic',
        attributes: { bold: true, italic: true }
      });
    });

    test('applies all 4 formats to same text', () => {
      // Insert "All"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'All') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[2], type: 'after' };

      // Apply all 4 formats
      doc.addMark(startAnchor, endAnchor, 'bold', { bold: true });
      doc.addMark(startAnchor, endAnchor, 'italic', { italic: true });
      doc.addMark(startAnchor, endAnchor, 'underline', { underline: true });
      doc.addMark(startAnchor, endAnchor, 'strike', { strike: true });

      const formatted = doc.getFormattedContent();
      expect(formatted.ops).toHaveLength(1);
      expect(formatted.ops[0]).toEqual({
        insert: 'All',
        attributes: {
          bold: true,
          italic: true,
          underline: true,
          strike: true
        }
      });
    });

    test('applies different formats to different parts', () => {
      // Insert "Bold Italic Underline"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'Bold Italic Underline') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      // Bold to "Bold" (0-3)
      doc.addMark(
        { opId: opIds[0], type: 'before' },
        { opId: opIds[3], type: 'after' },
        'bold',
        { bold: true }
      );

      // Italic to "Italic" (5-10)
      doc.addMark(
        { opId: opIds[5], type: 'before' },
        { opId: opIds[10], type: 'after' },
        'italic',
        { italic: true }
      );

      // Underline to "Underline" (12-20)
      doc.addMark(
        { opId: opIds[12], type: 'before' },
        { opId: opIds[20], type: 'after' },
        'underline',
        { underline: true }
      );

      const formatted = doc.getFormattedContent();
      expect(formatted.ops).toHaveLength(5); // Bold, space, Italic, space, Underline
      expect(formatted.ops[0]).toEqual({
        insert: 'Bold',
        attributes: { bold: true }
      });
      expect(formatted.ops[1]).toEqual({ insert: ' ' });
      expect(formatted.ops[2]).toEqual({
        insert: 'Italic',
        attributes: { italic: true }
      });
      expect(formatted.ops[3]).toEqual({ insert: ' ' });
      expect(formatted.ops[4]).toEqual({
        insert: 'Underline',
        attributes: { underline: true }
      });
    });
  });

  describe('Format Removal', () => {
    test('removes bold formatting', () => {
      // Insert "Bold"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'Bold') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      // Apply bold
      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[3], type: 'after' };
      const markId = doc.addMark(startAnchor, endAnchor, 'bold', { bold: true });

      // Verify bold is applied
      let formatted = doc.getFormattedContent();
      expect(formatted.ops[0].attributes).toEqual({ bold: true });

      // Remove bold
      doc.removeMark(markId);

      // Verify bold is removed
      formatted = doc.getFormattedContent();
      expect(formatted.ops[0]).toEqual({ insert: 'Bold' });
      expect(formatted.ops[0].attributes).toBeUndefined();
    });

    test('removes italic while keeping bold', () => {
      // Insert "Text"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'Text') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[3], type: 'after' };

      // Apply both bold and italic
      doc.addMark(startAnchor, endAnchor, 'bold', { bold: true });
      const italicMarkId = doc.addMark(startAnchor, endAnchor, 'italic', { italic: true });

      // Remove italic
      doc.removeMark(italicMarkId);

      const formatted = doc.getFormattedContent();
      expect(formatted.ops[0]).toEqual({
        insert: 'Text',
        attributes: { bold: true }
      });
    });
  });

  describe('Network Synchronization', () => {
    test('bold formatting syncs across two documents', () => {
      // User 1 creates and formats text
      const doc1 = new PeritextDocument('user1');
      let leftOpId = doc1.root.opId;
      const opIds = [];
      for (const char of 'Hello') {
        leftOpId = doc1.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      // Apply bold
      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[4], type: 'after' };
      doc1.addMark(startAnchor, endAnchor, 'bold', { bold: true });

      // Get operations log
      const operations = doc1.getOperationsLog();

      // User 2 receives operations
      const doc2 = new PeritextDocument('user2');
      for (const op of operations) {
        doc2.applyOperation(op);
      }

      // Both documents should have same text and formatting
      expect(doc2.getText()).toBe('Hello');
      const formatted = doc2.getFormattedContent();
      expect(formatted.ops[0]).toEqual({
        insert: 'Hello',
        attributes: { bold: true }
      });
    });

    test('all 4 formats sync across network', () => {
      // User 1 creates formatted text
      const doc1 = new PeritextDocument('user1');
      let leftOpId = doc1.root.opId;
      const opIds = [];
      for (const char of 'Test') {
        leftOpId = doc1.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[3], type: 'after' };

      // Apply all formats
      doc1.addMark(startAnchor, endAnchor, 'bold', { bold: true });
      doc1.addMark(startAnchor, endAnchor, 'italic', { italic: true });
      doc1.addMark(startAnchor, endAnchor, 'underline', { underline: true });
      doc1.addMark(startAnchor, endAnchor, 'strike', { strike: true });

      // Sync to user 2
      const operations = doc1.getOperationsLog();
      const doc2 = new PeritextDocument('user2');
      for (const op of operations) {
        doc2.applyOperation(op);
      }

      // Verify formatting synced
      const formatted = doc2.getFormattedContent();
      expect(formatted.ops[0]).toEqual({
        insert: 'Test',
        attributes: {
          bold: true,
          italic: true,
          underline: true,
          strike: true
        }
      });
    });

    test('formatting removal syncs across network', () => {
      // User 1 creates and formats text
      const doc1 = new PeritextDocument('user1');
      let leftOpId = doc1.root.opId;
      const opIds = [];
      for (const char of 'Text') {
        leftOpId = doc1.insert(char, leftOpId);
        opIds.push(leftOpId);
      }

      const startAnchor = { opId: opIds[0], type: 'before' };
      const endAnchor = { opId: opIds[3], type: 'after' };
      const markId = doc1.addMark(startAnchor, endAnchor, 'bold', { bold: true });

      // Get initial operations
      const ops1 = doc1.getOperationsLog();

      // User 2 receives and applies
      const doc2 = new PeritextDocument('user2');
      for (const op of ops1) {
        doc2.applyOperation(op);
      }

      // User 1 removes bold
      doc1.removeMark(markId);

      // Get new operations (should include removeMark)
      const ops2 = doc1.getOperationsLog();
      const newOps = ops2.slice(ops1.length); // Get only new operations

      // User 2 applies removal
      for (const op of newOps) {
        doc2.applyOperation(op);
      }

      // Both should have no formatting
      const formatted2 = doc2.getFormattedContent();
      expect(formatted2.ops[0]).toEqual({ insert: 'Text' });
    });
  });

  describe('Concurrent Formatting', () => {
    test('concurrent bold and italic by different users converge', () => {
      // Both users start with same text
      const doc1 = new PeritextDocument('user1');
      const doc2 = new PeritextDocument('user2');

      // User 1 creates text
      let leftOpId1 = doc1.root.opId;
      const opIds1 = [];
      for (const char of 'Text') {
        leftOpId1 = doc1.insert(char, leftOpId1);
        opIds1.push(leftOpId1);
      }

      // Sync text to user 2
      const textOps = doc1.getOperationsLog();
      for (const op of textOps) {
        doc2.applyOperation(op);
      }

      expect(doc2.getText()).toBe('Text');

      // User 1 applies bold
      const startAnchor1 = { opId: opIds1[0], type: 'before' };
      const endAnchor1 = { opId: opIds1[3], type: 'after' };
      doc1.addMark(startAnchor1, endAnchor1, 'bold', { bold: true });

      // User 2 applies italic (using same opIds since text is synced)
      const opIds2 = [];
      const seq2 = doc2.getOrderedSequence();
      for (const node of seq2) {
        if (node.char !== null && !node.deleted) {
          opIds2.push(node.opId);
        }
      }
      const startAnchor2 = { opId: opIds2[0], type: 'before' };
      const endAnchor2 = { opId: opIds2[3], type: 'after' };
      doc2.addMark(startAnchor2, endAnchor2, 'italic', { italic: true });

      // Sync both ways
      const ops1 = doc1.getOperationsLog().slice(textOps.length);
      const ops2 = doc2.getOperationsLog().slice(textOps.length);

      for (const op of ops2) {
        doc1.applyOperation(op);
      }
      for (const op of ops1) {
        doc2.applyOperation(op);
      }

      // Both should converge to bold + italic
      const formatted1 = doc1.getFormattedContent();
      const formatted2 = doc2.getFormattedContent();

      expect(formatted1.ops[0].attributes).toHaveProperty('bold', true);
      expect(formatted1.ops[0].attributes).toHaveProperty('italic', true);
      expect(formatted2.ops[0].attributes).toHaveProperty('bold', true);
      expect(formatted2.ops[0].attributes).toHaveProperty('italic', true);
    });
  });

  describe('Edge Cases', () => {
    test('formatting empty text does not crash', () => {
      // Try to apply formatting to empty document
      expect(() => {
        doc.addMark(
          { opId: doc.root.opId, type: 'before' },
          { opId: doc.root.opId, type: 'after' },
          'bold',
          { bold: true }
        );
      }).not.toThrow();
    });

    test('formatting single character works', () => {
      const opId = doc.insert('A', doc.root.opId);
      doc.addMark(
        { opId: opId, type: 'before' },
        { opId: opId, type: 'after' },
        'bold',
        { bold: true }
      );

      const formatted = doc.getFormattedContent();
      expect(formatted.ops[0]).toEqual({
        insert: 'A',
        attributes: { bold: true }
      });
    });

    test('invalid anchor positions throw error', () => {
      expect(() => {
        doc.addMark(
          { opId: 'invalid-id', type: 'before' },
          { opId: 'invalid-id', type: 'after' },
          'bold',
          { bold: true }
        );
      }).toThrow('Invalid anchor positions');
    });
  });
});
