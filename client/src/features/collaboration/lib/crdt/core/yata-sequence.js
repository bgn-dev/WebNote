/**
 * YATA Sequence
 * Implementation of YATA (Yet Another Transformation Approach) text CRDT
 * Manages the character sequence with YATA's originRight tracking for proper insertion semantics
 */

import { formatOpId } from './crdt-helpers';

/**
 * YataSequence class - Manages the character sequence with YATA algorithm
 */
export class YataSequence {
  constructor(userId, getNextCounter) {
    this.userId = userId;
    this.getNextCounter = getNextCounter; // Callback to get next counter value
    this.characters = new Map(); // opId -> character node
    this.root = this.createRootNode();
  }

  /**
   * Create the root node that anchors the sequence
   * Root is invisible and serves as the starting point for all insertions
   */
  createRootNode() {
    const rootId = "0@root";
    const rootNode = {
      opId: rootId,
      char: null,    // Root has no character
      afterId: null, // Root has no predecessor (start of sequence)
      originRight: null,
      rightId: null, // Initially no characters
      deleted: false,
      userId: "root",
      counter: 0
    };
    this.characters.set(rootId, rootNode);
    return rootNode;
  }

  /**
   * Generate unique operation ID using the parent's counter
   */
  generateOpId() {
    const counter = this.getNextCounter();
    return formatOpId(counter, this.userId);
  }

  /**
   * Insert a character at the specified position
   *
   * @param {string} char - Character to insert
   * @param {string|null} leftOpId - OpId to insert after (null = root)
   * @returns {string} - OpId of inserted character
   */
  insert(char, leftOpId = null) {
    // Generate counter and opId
    const counter = this.getNextCounter();
    const opId = formatOpId(counter, this.userId);

    // Default to root if no leftOpId specified
    if (leftOpId === null) {
      leftOpId = this.root.opId;
    }

    const leftNode = this.characters.get(leftOpId);
    if (!leftNode) {
      throw new Error(`Left node ${leftOpId} not found`);
    }

    // YATA: Capture originRight (what's currently to the right of leftNode)
    // This allows "insert between" semantics for better cursor positioning
    const originRight = leftNode.rightId;  // May be null if inserting at end

    const newNode = {
      opId,
      char,
      afterId: leftOpId,       // Immutable causal reference (originLeft - what was left when inserted)
      originRight: originRight, // YATA: what was right at insertion time
      rightId: null,            // Actual right neighbor in sequence (maintained by YATA)
      deleted: false,
      userId: this.userId,
      counter: counter
    };

    // YATA ordering (improved RGA with originRight tracking)
    // This ensures deterministic convergence and proper "insert between" semantics
    this.insertIntoSequence(newNode, leftNode);

    this.characters.set(opId, newNode);

    return opId;
  }

  /**
   * YATA insertion algorithm (Yjs-inspired)
   * Finds the correct position considering concurrent insertions and originRight tracking
   *
   * YATA extends RGA with originRight to support proper "insert between" semantics:
   * 1. To insert element E with afterId=P (originLeft) and originRight=R, start scanning from P
   * 2. If we encounter our originRight, insert BEFORE it immediately
   * 3. Among siblings (nodes with afterId=P), use RGA counter/userId ordering
   * 4. When scanning past siblings' descendants, check if any is our originRight
   * 5. Insert at the determined position
   *
   * Key improvement over RGA: originRight tracking ensures insertions at position 0
   * work intuitively (new content appears before existing content, not after).
   */
  insertIntoSequence(newNode, leftNode) {
    let current = leftNode;

    // YATA Algorithm: scan right to find correct position
    // We want to go AFTER originLeft (leftNode) but BEFORE originRight (if it exists)
    while (current.rightId) {
      const rightNode = this.characters.get(current.rightId);

      // YATA Rule 1: If we've reached our originRight, insert BEFORE it
      if (newNode.originRight && rightNode.opId === newNode.originRight) {
        break;  // Insert before originRight
      }

      // YATA Rule 2: Check if this is a sibling (same originLeft)
      if (rightNode.afterId === newNode.afterId) {
        // Among siblings, use RGA counter/userId ordering
        if (this.shouldInsertBefore(newNode, rightNode)) {
          break;  // Insert before this sibling
        }

        // This sibling has smaller counter - skip it AND its descendants
        current = rightNode;

        // Skip all descendants
        while (current.rightId) {
          const possibleDescendant = this.characters.get(current.rightId);

          // YATA Rule 3: Check if descendant is our originRight
          if (newNode.originRight && possibleDescendant.opId === newNode.originRight) {
            // Stop here - we'll insert before originRight on next iteration
            break;
          }

          if (possibleDescendant.afterId === newNode.afterId) {
            // Found another sibling - break to compare with it
            break;
          }

          current = possibleDescendant;
        }
      } else {
        // Not a sibling - we've left the sibling region
        break;
      }
    }

    // Insert newNode between current and current.rightId
    newNode.rightId = current.rightId;
    current.rightId = newNode.opId;

    // NOTE: We do NOT modify rightNode or newNode.afterId/originRight
    // - afterId and originRight are immutable causal references from the operation
    // - We only need rightId pointers for forward traversal
  }

  /**
   * RGA ordering: newNode should be inserted before existingNode if:
   * 1. newNode has earlier Lamport counter (logical time), OR
   * 2. Same counter but lower userId lexicographically
   *
   * This ensures deterministic ordering across all replicas regardless of wall-clock time.
   */
  shouldInsertBefore(newNode, existingNode) {
    // Use Lamport counter for deterministic ordering
    if (newNode.counter !== existingNode.counter) {
      return newNode.counter < existingNode.counter;
    }
    // Tie-break by userId (lexicographic order)
    return newNode.userId.localeCompare(existingNode.userId) < 0;
  }

  /**
   * Delete a character (tombstone deletion)
   *
   * @param {string} opId - OpId of character to delete
   * @returns {boolean} - True if deleted, false if not found or already deleted
   */
  delete(opId) {
    const node = this.characters.get(opId);
    if (!node || node.deleted) {
      return false;
    }

    node.deleted = true;
    return true;
  }

  /**
   * Get current visible text content
   * @returns {string} - Current document text
   */
  getText() {
    const sequence = this.getOrderedSequence();
    return sequence
      .filter(node => !node.deleted && node.char !== null)
      .map(node => node.char)
      .join('');
  }

  /**
   * Get ordered sequence of all nodes (including deleted/tombstones)
   * @returns {Array} - Array of character nodes in document order
   */
  getOrderedSequence() {
    const sequence = [];
    let current = this.root;

    while (current) {
      sequence.push(current);
      current = current.rightId ? this.characters.get(current.rightId) : null;
    }

    return sequence.slice(1); // Remove root node
  }

  /**
   * Get visible character positions for cursor mapping
   * @returns {Array} - Array of {opId, index} for visible characters
   */
  getVisiblePositions() {
    const sequence = this.getOrderedSequence();
    const positions = [];
    let index = 0;

    for (const node of sequence) {
      if (!node.deleted && node.char !== null) {
        positions.push({ opId: node.opId, index });
        index++;
      }
    }

    return positions;
  }

  /**
   * Find opId at given text index
   * @param {number} index - Text index
   * @returns {string|null} - OpId at that position
   */
  getOpIdAtIndex(index) {
    const positions = this.getVisiblePositions();
    return positions[index]?.opId || null;
  }

  /**
   * Get the leftOpId for insertion at a cursor position
   * Cursor positions are BETWEEN characters, not AT characters
   * @param {number} cursorIndex - Cursor position (0 = before first char, 1 = after first char, etc.)
   * @returns {string} - OpId of character to insert after
   */
  getLeftOpIdForCursor(cursorIndex) {
    const positions = this.getVisiblePositions();

    // Cursor at position 0 means insert at the beginning (after root)
    if (cursorIndex === 0) {
      return this.root.opId;
    }

    // Cursor at position N means insert after the (N-1)th visible character
    const leftCharIndex = cursorIndex - 1;
    const leftChar = positions[leftCharIndex];

    if (!leftChar) {
      // Cursor is beyond the end of the document - insert after last character
      const lastChar = positions[positions.length - 1];
      return lastChar ? lastChar.opId : this.root.opId;
    }

    return leftChar.opId;
  }

  /**
   * Find text index of given opId
   * @param {string} opId - Operation ID
   * @returns {number} - Text index (-1 if not found or deleted)
   */
  getIndexOfOpId(opId) {
    const positions = this.getVisiblePositions();
    const position = positions.find(p => p.opId === opId);
    return position ? position.index : -1;
  }

  /**
   * Get cursor position after a given opId
   * @param {string} opId - Operation ID
   * @returns {number} - Cursor position (0 = before first char, 1 = after first char, etc.)
   */
  getCursorAfterOpId(opId) {
    if (opId === this.root.opId) {
      return 0; // Cursor at beginning
    }

    const charIndex = this.getIndexOfOpId(opId);
    return charIndex >= 0 ? charIndex + 1 : 0;
  }

  /**
   * Get text index where an operation occurred/will occur
   * @param {Object} operation - Operation object
   * @returns {number} - Text index (-1 if not found)
   */
  getTextIndexForOperation(operation) {
    if (!operation) return -1;

    switch (operation.action) {
      case 'insert':
        // For insert operations, find where the character was/will be inserted
        if (operation.opId && this.characters.has(operation.opId)) {
          return this.getIndexOfOpId(operation.opId);
        }
        // If not found, calculate based on leftId
        if (operation.leftId) {
          const leftIndex = this.getIndexOfOpId(operation.leftId);
          return leftIndex >= 0 ? leftIndex + 1 : 0;
        }
        return 0; // Insert at beginning

      case 'delete':
        // For delete operations, find where the character was before deletion
        if (operation.targetId) {
          // Check if character still exists (not yet deleted)
          const targetNode = this.characters.get(operation.targetId);
          if (targetNode && !targetNode.deleted) {
            return this.getIndexOfOpId(operation.targetId);
          }

          // If already deleted, find its position in sequence
          const sequence = this.getOrderedSequence();
          const targetIndex = sequence.findIndex(node => node.opId === operation.targetId);
          if (targetIndex >= 0) {
            // Count visible characters before this position
            let textIndex = 0;
            for (let i = 0; i < targetIndex; i++) {
              const node = sequence[i];
              if (!node.deleted && node.char !== null) {
                textIndex++;
              }
            }
            return textIndex;
          }
        }
        return -1;

      default:
        return -1;
    }
  }

  /**
   * Compress sequence by removing unreferenced tombstones
   * @returns {number} - Number of tombstones removed
   */
  compress(referencedIds) {
    let removed = 0;

    // Remove unreferenced tombstones
    for (const [opId, node] of this.characters.entries()) {
      if (node.deleted && !referencedIds.has(opId) && opId !== this.root.opId) {
        this.characters.delete(opId);
        removed++;
      }
    }

    return removed;
  }
}
