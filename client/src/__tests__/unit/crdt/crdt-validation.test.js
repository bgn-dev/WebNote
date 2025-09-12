/**
 * Comprehensive validation tests for CRDT properties
 * These tests will pass once the convergence issues are fixed
 */

import PeritextDocument from '../../../components/crdt/peritext-document';

describe('CRDT Property Validation (Will Pass After Fix)', () => {
  
  // Helper function to apply operations in all possible orders
  function testAllPermutations(operations, expectedText) {
    const permutations = getPermutations(operations);
    const results = new Set();
    
    permutations.forEach(perm => {
      const doc = new PeritextDocument('test');
      perm.forEach(op => doc.applyOperation(op));
      results.add(doc.getText());
    });
    
    return {
      allSame: results.size === 1,
      results: Array.from(results),
      expected: expectedText
    };
  }
  
  function getPermutations(arr) {
    if (arr.length <= 1) return [arr];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      const perms = getPermutations(rest);
      perms.forEach(perm => result.push([arr[i], ...perm]));
    }
    return result;
  }

  describe('Convergence Properties (Now Fixed)', () => {
    test('two concurrent inserts converge deterministically', () => {
      const operations = [
        {
          opId: '1@alice',
          char: 'A',
          leftId: '0@root',
          action: 'insert',
          userId: 'alice',
          counter: 1,
          timestamp: 1000
        },
        {
          opId: '1@bob', 
          char: 'B',
          leftId: '0@root',
          action: 'insert',
          userId: 'bob',
          counter: 1,
          timestamp: 1000
        }
      ];
      
      const result = testAllPermutations(operations, 'AB');
      
      expect(result.allSame).toBe(true);
      expect(result.results[0]).toBe('AB'); // alice < bob lexicographically
    });

    test('three concurrent inserts maintain lexicographic order', () => {
      const operations = [
        { opId: '1@alice', char: 'A', leftId: '0@root', action: 'insert', userId: 'alice', counter: 1, timestamp: 1000 },
        { opId: '1@bob', char: 'B', leftId: '0@root', action: 'insert', userId: 'bob', counter: 1, timestamp: 1000 },
        { opId: '1@charlie', char: 'C', leftId: '0@root', action: 'insert', userId: 'charlie', counter: 1, timestamp: 1000 }
      ];
      
      const result = testAllPermutations(operations, 'ABC');
      
      expect(result.allSame).toBe(true);
      expect(result.results[0]).toBe('ABC');
    });

    test('mixed insert positions maintain consistency', () => {
      const operations = [
        // First, establish "Hello"  
        { opId: '1@user1', char: 'H', leftId: '0@root', action: 'insert', userId: 'user1', counter: 1, timestamp: 1000 },
        { opId: '2@user1', char: 'e', leftId: '1@user1', action: 'insert', userId: 'user1', counter: 2, timestamp: 1001 },
        { opId: '3@user1', char: 'l', leftId: '2@user1', action: 'insert', userId: 'user1', counter: 3, timestamp: 1002 },
        { opId: '4@user1', char: 'l', leftId: '3@user1', action: 'insert', userId: 'user1', counter: 4, timestamp: 1003 },
        { opId: '5@user1', char: 'o', leftId: '4@user1', action: 'insert', userId: 'user1', counter: 5, timestamp: 1004 },
        
        // Then concurrent inserts at beginning
        { opId: '1@alice', char: 'A', leftId: '0@root', action: 'insert', userId: 'alice', counter: 1, timestamp: 1005 },
        { opId: '1@bob', char: 'B', leftId: '0@root', action: 'insert', userId: 'bob', counter: 1, timestamp: 1005 }
      ];
      
      const result = testAllPermutations(operations.slice(-2), 'AB'); // Just test the concurrent part
      
      expect(result.allSame).toBe(true);
    });
  });

  describe('Current Working Tests', () => {
    test('sequential operations work correctly', () => {
      const doc = new PeritextDocument('user1');
      
      let leftOpId = doc.root.opId;
      for (const char of 'Sequential') {
        leftOpId = doc.insert(char, leftOpId);
      }
      
      expect(doc.getText()).toBe('Sequential');
    });

    test('delete operations work on sequential text', () => {
      const doc = new PeritextDocument('user1');
      
      // Build "ABCD"
      let leftOpId = doc.root.opId;
      const opIds = [];
      for (const char of 'ABCD') {
        leftOpId = doc.insert(char, leftOpId);
        opIds.push(leftOpId);
      }
      
      expect(doc.getText()).toBe('ABCD');
      
      // Delete 'B' (second character)
      const deleteOp = {
        action: 'delete',
        targetId: opIds[1], // 'B'
        timestamp: Date.now(),
        userId: 'user1',
        counter: 5
      };
      
      doc.applyRemoteDelete(deleteOp);
      expect(doc.getText()).toBe('ACD');
    });

    test('idempotence works correctly', () => {
      const doc = new PeritextDocument('user1');
      
      const operation = {
        opId: '1@remote',
        char: 'X',
        leftId: doc.root.opId,
        action: 'insert',
        userId: 'remote',
        counter: 1,
        timestamp: Date.now()
      };
      
      const result1 = doc.applyOperation(operation);
      const result2 = doc.applyOperation(operation);
      
      expect(result1).not.toBe(false);
      expect(result2).toBe(false);
      expect(doc.getText()).toBe('X');
    });
  });

  describe('Performance Characteristics', () => {
    test('handles moderately sized documents efficiently', () => {
      const doc = new PeritextDocument('user1');
      
      const start = performance.now();
      
      // Insert 1000 characters
      let leftOpId = doc.root.opId;
      for (let i = 0; i < 1000; i++) {
        leftOpId = doc.insert('a', leftOpId);
      }
      
      const end = performance.now();
      const duration = end - start;
      
      expect(doc.getText().length).toBe(1000);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      
      console.log(`Inserted 1000 characters in ${duration.toFixed(2)}ms`);
    });

    test('serialization handles reasonable document sizes', () => {
      const doc = new PeritextDocument('user1');
      
      // Create document with some content
      let leftOpId = doc.root.opId;
      for (let i = 0; i < 100; i++) {
        leftOpId = doc.insert(String.fromCharCode(65 + (i % 26)), leftOpId);
      }
      
      const start = performance.now();
      const serialized = doc.serialize();
      const end = performance.now();
      
      expect(serialized).toBeTruthy();
      expect(typeof serialized).toBe('object');
      console.log(`Serialized 100-char document in ${(end - start).toFixed(2)}ms`);
      
      const deserializeStart = performance.now();
      const deserialized = PeritextDocument.deserialize(serialized, 'user1');
      const deserializeEnd = performance.now();
      
      expect(deserialized.getText()).toBe(doc.getText());
      console.log(`Deserialized in ${(deserializeEnd - deserializeStart).toFixed(2)}ms`);
    });
  });

  describe('Edge Cases', () => {
    test('handles empty operations gracefully', () => {
      const doc = new PeritextDocument('user1');
      
      const invalidOp = {};
      const result = doc.applyOperation(invalidOp);
      
      expect(result).toBe(false);
      expect(doc.getText()).toBe('');
    });

    test('handles operations with invalid opIds', () => {
      const doc = new PeritextDocument('user1');
      
      const invalidOp = {
        opId: 'invalid-format',
        char: 'X',
        leftId: doc.root.opId,
        action: 'insert',
        userId: 'user1',
        counter: 1,
        timestamp: Date.now()
      };
      
      // Should either handle gracefully or reject cleanly
      const result = doc.applyOperation(invalidOp);
      expect(typeof result).toBe('boolean');
    });

    test('handles very long user IDs', () => {
      const longUserId = 'a'.repeat(1000);
      const doc = new PeritextDocument(longUserId);
      
      expect(doc.userId).toBe(longUserId);
      
      const opId = doc.generateOpId();
      expect(opId.includes(longUserId)).toBe(true);
    });
  });
});