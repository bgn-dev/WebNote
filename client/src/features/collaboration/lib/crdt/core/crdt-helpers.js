/**
 * CRDT Helper Functions
 * Pure utility functions for CRDT operations (no instance state dependencies)
 */

/**
 * Compare two operations for ordering (Lamport timestamp comparison)
 * Used in conflict resolution for concurrent operations
 *
 * @param {Object} op1 - First operation {counter, userId}
 * @param {Object} op2 - Second operation {counter, userId}
 * @returns {number} - Positive if op1 > op2, negative if op1 < op2, 0 if equal
 */
export function compareOperations(op1, op2) {
  // First compare by Lamport counter
  if (op1.counter !== op2.counter) {
    return op1.counter - op2.counter;
  }

  // Tie-break by userId (lexicographic order for determinism)
  return op1.userId.localeCompare(op2.userId);
}

/**
 * Parse an operation ID into its components
 *
 * @param {string} opId - Operation ID in format "counter@userId"
 * @returns {Object} - {counter: number, userId: string}
 */
export function parseOpId(opId) {
  const parts = opId.split('@');
  return {
    counter: parseInt(parts[0], 10),
    userId: parts[1]
  };
}

/**
 * Format an operation ID from components
 *
 * @param {number} counter - Lamport counter
 * @param {string} userId - User identifier
 * @returns {string} - Operation ID in format "counter@userId"
 */
export function formatOpId(counter, userId) {
  return `${counter}@${userId}`;
}

/**
 * Check if two anchors are equal
 *
 * @param {Object} anchor1 - First anchor {opId, type}
 * @param {Object} anchor2 - Second anchor {opId, type}
 * @returns {boolean} - True if anchors are equal
 */
export function anchorsEqual(anchor1, anchor2) {
  if (!anchor1 || !anchor2) return false;
  return anchor1.opId === anchor2.opId && anchor1.type === anchor2.type;
}

/**
 * Generate a unique mark ID
 *
 * @param {number} counter - Current counter value
 * @param {string} userId - User identifier
 * @returns {string} - Mark ID in format "counter@userId"
 */
export function generateMarkId(counter, userId) {
  return formatOpId(counter, userId);
}

/**
 * Validate operation structure
 *
 * @param {Object} operation - Operation to validate
 * @returns {boolean} - True if operation is valid
 * @throws {Error} - If operation is invalid
 */
export function validateOperation(operation) {
  if (!operation || typeof operation !== 'object') {
    throw new Error('Operation must be an object');
  }

  if (!operation.action) {
    throw new Error('Operation must have an action');
  }

  if (!operation.userId) {
    throw new Error('Operation must have a userId');
  }

  switch (operation.action) {
    case 'insert':
      if (!operation.opId) {
        throw new Error('Insert operation must have opId');
      }
      if (operation.char === undefined || operation.char === null) {
        throw new Error('Insert operation must have char');
      }
      if (!operation.leftId) {
        throw new Error('Insert operation must have leftId');
      }
      break;

    case 'delete':
      if (!operation.targetId) {
        throw new Error('Delete operation must have targetId');
      }
      break;

    case 'addMark':
      if (!operation.markId) {
        throw new Error('AddMark operation must have markId');
      }
      if (!operation.start || !operation.end) {
        throw new Error('AddMark operation must have start and end anchors');
      }
      if (!operation.markType) {
        throw new Error('AddMark operation must have markType');
      }
      break;

    case 'removeMark':
      if (!operation.markId) {
        throw new Error('RemoveMark operation must have markId');
      }
      break;

    default:
      throw new Error(`Unknown operation action: ${operation.action}`);
  }

  return true;
}
