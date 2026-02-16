/**
 * CRDT Serializer
 * Functions for serializing and deserializing CRDT document state
 * Handles conversion between runtime structures and persistence/network formats
 */

import { compareOperations } from './crdt-helpers';

/**
 * Create an operation object for broadcasting
 *
 * @param {string} action - 'insert', 'delete', 'addMark', 'removeMark'
 * @param {Object} params - Action-specific parameters
 * @param {string} userId - User identifier
 * @param {number} counter - Current counter value
 * @returns {Object} - Operation object for network transmission
 */
export function createOperation(action, params, userId, counter) {
  const baseOp = {
    action,
    userId
  };

  switch (action) {
    case 'insert':
      return {
        ...baseOp,
        opId: params.opId,
        char: params.char,
        leftId: params.leftId,     // originLeft (what was left at insertion)
        rightId: params.rightId,    // YATA: originRight (what was right at insertion)
        counter
      };
    case 'delete':
      return {
        ...baseOp,
        targetId: params.targetId,
        counter
      };
    case 'addMark':
      return {
        ...baseOp,
        markId: params.markId,
        start: params.start, // {opId, type}
        end: params.end,     // {opId, type}
        markType: params.markType,
        attributes: params.attributes || {},
        canOverlap: params.canOverlap,
        expand: params.expand,
        counter: params.counter
      };
    case 'removeMark':
      return {
        ...baseOp,
        markId: params.markId,
        counter: params.counter
      };
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Convert current document state to operations log for synchronization
 *
 * @param {Map} characters - Character map (opId -> node)
 * @param {Map} marks - Marks map (markId -> mark)
 * @param {Object} root - Root node
 * @returns {Array} - Sorted array of all operations
 */
export function getOperationsLog(characters, marks, root) {
  const operations = [];

  // Helper to get ordered sequence
  const getSequence = () => {
    const sequence = [];
    let current = root;

    while (current) {
      sequence.push(current);
      current = current.rightId ? characters.get(current.rightId) : null;
    }

    return sequence.slice(1); // Remove root node
  };

  // Add character insertion operations
  const sequence = getSequence();
  for (const node of sequence) {
    if (node.opId !== root.opId) {
      operations.push({
        action: 'insert',
        opId: node.opId,
        char: node.char,
        leftId: node.afterId,       // originLeft (immutable causal reference)
        rightId: node.originRight,   // YATA: originRight (what was right at insertion)
        userId: node.userId,
        counter: node.counter
      });

      if (node.deleted) {
        operations.push({
          action: 'delete',
          targetId: node.opId,
          userId: node.userId,
          counter: node.counter
        });
      }
    }
  }

  // Add mark operations
  for (const mark of marks.values()) {
    operations.push({
      action: 'addMark',
      markId: mark.markId,
      start: mark.start,
      end: mark.end,
      markType: mark.markType,
      attributes: mark.attributes,
      canOverlap: mark.canOverlap,
      expand: mark.expand,
      userId: mark.userId,
      counter: mark.counter
    });

    if (mark.deleted) {
      operations.push({
        action: 'removeMark',
        markId: mark.markId,
        userId: mark.userId,
        counter: mark.counter
      });
    }
  }

  // Sort by Lamport counter, then userId for deterministic ordering
  return operations.sort((a, b) => {
    const counterA = a.counter || 0;
    const counterB = b.counter || 0;
    if (counterA !== counterB) return counterA - counterB;
    return a.userId.localeCompare(b.userId);
  });
}

/**
 * Serialize document state for persistence (Firestore compatible)
 *
 * @param {Object} doc - Document instance
 * @returns {Object} - Serialized state as plain object
 */
export function serialize(doc) {
  // Convert Maps and Sets to plain objects/arrays for Firestore
  const charactersObj = {};
  doc.characters.forEach((value, key) => {
    charactersObj[key] = value;
  });

  const marksObj = {};
  doc.marks.forEach((value, key) => {
    marksObj[key] = value;
  });

  const opSetsObj = {};
  doc.opSets.forEach((value, key) => {
    opSetsObj[key] = Array.from(value);
  });

  return {
    userId: doc.userId,
    counter: doc.counter,  // Single unified counter for all operations
    characters: charactersObj,
    marks: marksObj,
    rootOpId: doc.root.opId,
    appliedOperations: Array.from(doc.appliedOperations),
    pendingOperations: doc.pendingOperations, // Include buffered operations
    opSets: opSetsObj,
    version: Date.now()
  };
}

/**
 * Deserialize document from persisted state
 * Note: This creates a new document instance
 *
 * @param {Object} data - Serialized document state
 * @param {string} userId - User identifier for new document
 * @param {Function} DocumentClass - PeritextDocument constructor
 * @returns {Object} - Restored document instance
 */
export function deserialize(data, userId, DocumentClass) {
  const doc = new DocumentClass(userId);

  // Restore counter (single unified counter for all operations)
  doc.counter = data.counter || 0;

  // Restore characters from object format (to sequence)
  if (data.characters) {
    doc.sequence.characters = new Map(Object.entries(data.characters));
  }

  // Restore marks from object format
  if (data.marks) {
    doc.marks = new Map(Object.entries(data.marks));
  }

  // Restore root reference (to sequence)
  if (data.rootOpId && doc.sequence.characters.has(data.rootOpId)) {
    doc.sequence.root = doc.sequence.characters.get(data.rootOpId);
  }

  // Restore applied operations
  if (data.appliedOperations) {
    doc.appliedOperations = new Set(data.appliedOperations);
  }

  // Restore pending operations
  if (data.pendingOperations && Array.isArray(data.pendingOperations)) {
    doc.pendingOperations = data.pendingOperations;
    // Try to process pending operations after restoration
    doc.processPendingOperations();
  }

  // Restore op-sets from object format
  if (data.opSets) {
    doc.opSets = new Map(Object.entries(data.opSets).map(([key, value]) => [key, new Set(value)]));
  }

  return doc;
}

/**
 * Get document state suitable for text editor initialization
 *
 * @param {Object} doc - Document instance
 * @returns {Object} - Document state with content and formatting
 */
export function getDocumentState(doc) {
  const formattedContent = doc.getFormattedContent();
  const sequence = doc.getOrderedSequence();
  const visibleChars = sequence.filter(n => !n.deleted && n.char !== null);

  return {
    content: formattedContent,
    text: doc.getText(),
    length: visibleChars.length,
    marks: Array.from(doc.marks.values()).filter(m => !m.deleted),
    version: {
      userId: doc.userId,
      counter: doc.counter
    }
  };
}
