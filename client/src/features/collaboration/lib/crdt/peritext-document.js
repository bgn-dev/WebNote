/**
 * Peritext: A CRDT for Collaborative Rich Text Editing
 * Full implementation based on the Peritext paper by Litt et al.
 * Provides conflict-free collaborative rich text editing with intent preservation
 */

import {
  compareOperations,
  formatOpId,
  generateMarkId
} from './core/crdt-helpers';

import * as CRDTSerializer from './core/crdt-serializer';
import { YataSequence } from './core/yata-sequence';

class PeritextDocument {
  constructor(userId) {
    this.userId = userId;
    this.counter = 0;  // Single Lamport counter for ALL operations (chars + marks)

    // YATA sequence for character management
    this.sequence = new YataSequence(userId, () => ++this.counter);

    this.appliedOperations = new Set(); // Track applied operation IDs for deduplication

    // Peritext formatting system
    this.marks = new Map(); // markId -> MarkObject

    // Op-sets for anchor positions (Algorithm 1 from paper)
    this.opSets = new Map(); // anchorPosition -> Set of operations

    // Buffer for operations with missing dependencies (handles out-of-order delivery)
    this.pendingOperations = []; // Operations waiting for their dependencies
  }

  // Proxy properties for backwards compatibility
  get characters() {
    return this.sequence.characters;
  }

  get root() {
    return this.sequence.root;
  }

  /**
   * Generate unique operation ID
   */
  generateOpId() {
    return formatOpId(++this.counter, this.userId);
  }

  /**
   * Generate unique mark ID for formatting
   * Uses same Lamport counter as character operations for proper causality
   */
  generateMarkId() {
    return generateMarkId(++this.counter, this.userId);
  }

  /**
   * Update op-set at anchor position (Algorithm 1 from paper)
   * @param {Object} anchor - {opId, type}
   * @param {string} operation - 'addMark' or 'removeMark'
   * @param {Object} mark - Mark object
   */
  updateOpSetAtAnchor(anchor, operation, mark) {
    const anchorKey = `${anchor.opId}:${anchor.type}`;
    
    if (!this.opSets.has(anchorKey)) {
      this.opSets.set(anchorKey, new Set());
    }
    
    const opSet = this.opSets.get(anchorKey);
    
    if (operation === 'addMark') {
      opSet.add({
        type: 'addMark',
        markId: mark.markId,
        markType: mark.markType,
        userId: mark.userId,
        counter: mark.counter
      });
    } else if (operation === 'removeMark') {
      opSet.add({
        type: 'removeMark',
        markId: mark.markId,
        userId: mark.userId,
        counter: mark.counter
      });
    }
  }

  /**
   * Update op-sets for all characters within a mark's span (Algorithm 1 from paper)
   * @param {Object} mark - Mark object with start/end anchors
   */
  updateOpSetsForMark(mark) {
    const sequence = this.getOrderedSequence();
    const startChar = sequence.find(n => n.opId === mark.start.opId);
    const endChar = sequence.find(n => n.opId === mark.end.opId);

    if (!startChar || !endChar) return;

    const startIndex = sequence.indexOf(startChar);
    const endIndex = sequence.indexOf(endChar);

    // Update op-sets for all characters in the span
    for (let i = startIndex; i <= endIndex; i++) {
      const char = sequence[i];
      const beforeKey = `${char.opId}:before`;
      const afterKey = `${char.opId}:after`;

      // Determine if this position should have the mark
      let shouldHaveMark = false;
      if (i > startIndex && i < endIndex) {
        // Middle of span - always has mark
        shouldHaveMark = true;
      } else if (i === startIndex && mark.start.type === 'before') {
        // At start position with 'before' anchor - mark starts here
        shouldHaveMark = true;
      } else if (i === startIndex && mark.start.type === 'after') {
        // At start position with 'after' anchor - mark starts after this char
        shouldHaveMark = false;
      } else if (i === endIndex && mark.end.type === 'after') {
        // At end position with 'after' anchor - mark includes this char
        shouldHaveMark = true;
      } else if (i === endIndex && mark.end.type === 'before') {
        // At end position with 'before' anchor - mark ends before this char
        shouldHaveMark = false;
      }

      if (shouldHaveMark) {
        // Update both :before and :after op-sets for this character
        [beforeKey, afterKey].forEach(key => {
          if (!this.opSets.has(key)) {
            this.opSets.set(key, new Set());
          }

          const opSet = this.opSets.get(key);
          opSet.add({
            type: 'addMark',
            markId: mark.markId,
            markType: mark.markType,
            userId: mark.userId,
            counter: mark.counter
          });
        });
      }
    }

    // CRITICAL FIX: Create a boundary after the mark ends to prevent findPreviousOpSet from propagating it
    // This ensures marks don't bleed into subsequent characters
    const boundaryIndex = mark.end.type === 'after' ? endIndex + 1 : endIndex;
    if (boundaryIndex < sequence.length) {
      const boundaryChar = sequence[boundaryIndex];

      // Create boundary op-sets at both :before and :after to stop mark propagation
      // getMarksForCharacter uses :after, so we need both to ensure the boundary works
      const beforeKey = `${boundaryChar.opId}:before`;
      const afterKey = `${boundaryChar.opId}:after`;

      // Ensure there are op-sets at the boundary (even if empty)
      // This stops findPreviousOpSet from finding marks from before the boundary
      if (!this.opSets.has(beforeKey)) {
        this.opSets.set(beforeKey, new Set());
      }
      if (!this.opSets.has(afterKey)) {
        this.opSets.set(afterKey, new Set());
      }
    }
  }

  /**
   * Find previous op-set (FindPrevious from Algorithm 1)
   * @param {string} anchorKey - Anchor position key
   * @returns {Set} - Closest preceding op-set
   */
  findPreviousOpSet(anchorKey) {
    const sequence = this.getOrderedSequence();
    const [targetOpId, targetType] = anchorKey.split(':');
    
    // Find the character in sequence
    const charIndex = sequence.findIndex(node => node.opId === targetOpId);
    if (charIndex === -1) return new Set();
    
    // Iterate backwards to find previous op-set
    for (let i = charIndex - 1; i >= 0; i--) {
      const node = sequence[i];
      const beforeKey = `${node.opId}:before`;
      const afterKey = `${node.opId}:after`;
      
      if (this.opSets.has(afterKey)) {
        return this.opSets.get(afterKey);
      }
      if (this.opSets.has(beforeKey)) {
        return this.opSets.get(beforeKey);
      }
    }
    
    return new Set();
  }

  /**
   * Insert character at position after leftOpId
   * @param {string} char - Character to insert
   * @param {string} leftOpId - OpId of character to insert after (null for beginning)
   * @returns {string} - OpId of inserted character
   */
  insert(char, leftOpId = null) {
    // Delegate to YataSequence
    const opId = this.sequence.insert(char, leftOpId);

    // Handle mark expansion according to Section 3.3
    this.handleMarkExpansionOnInsertion(opId, leftOpId);

    return opId;
  }


  /**
   * Handle mark expansion when text is inserted (Section 3.3)
   * FIXED: Now uses op-sets (Algorithm 1 from paper) for mark inheritance
   *
   * When a character is inserted, it inherits formatting from its left neighbor
   * by copying the left neighbor's op-set. This ensures consistent formatting
   * without modifying mark anchors (maintaining immutability).
   *
   * @param {string} newOpId - OpId of newly inserted character
   * @param {string} leftOpId - OpId of character to the left (causal reference)
   */
  handleMarkExpansionOnInsertion(newOpId, leftOpId) {
    // Get the op-set from the left character (at :after position)
    const leftAfterKey = `${leftOpId}:after`;
    const leftOpSet = this.opSets.get(leftAfterKey);

    if (!leftOpSet || leftOpSet.size === 0) {
      // Left character has no formatting - try to find previous op-set
      const previousOpSet = this.findPreviousOpSet(leftAfterKey);
      if (!previousOpSet || previousOpSet.size === 0) {
        return; // No formatting to inherit
      }

      // Copy the previous op-set to the new character's positions
      const newBeforeKey = `${newOpId}:before`;
      const newAfterKey = `${newOpId}:after`;

      this.opSets.set(newBeforeKey, new Set(previousOpSet));
      this.opSets.set(newAfterKey, new Set(previousOpSet));
      return;
    }

    // Copy the left character's op-set to the new character's positions
    // Both :before and :after positions get the same formatting
    const newBeforeKey = `${newOpId}:before`;
    const newAfterKey = `${newOpId}:after`;

    this.opSets.set(newBeforeKey, new Set(leftOpSet));
    this.opSets.set(newAfterKey, new Set(leftOpSet));
  }

  /**
   * Mark character as deleted (tombstone approach)
   * @param {string} opId - OpId of character to delete
   */
  delete(opId) {
    return this.sequence.delete(opId);
  }

  /**
   * Create unique operation identifier for deduplication
   * @param {Object} operation - Operation to create ID for
   * @returns {string} - Unique operation identifier
   */
  createOperationId(operation) {
    if (operation.action === 'insert') {
      return `insert-${operation.opId}`;
    } else if (operation.action === 'delete') {
      return `delete-${operation.targetId}-${operation.counter || 0}-${operation.userId}`;
    } else if (operation.action === 'addMark') {
      return `addMark-${operation.markId}`;
    } else if (operation.action === 'removeMark') {
      return `removeMark-${operation.markId}-${operation.counter || 0}-${operation.userId}`;
    }
    return `${operation.action}-${operation.counter || 0}-${operation.userId}`;
  }

  /**
   * Validate operation before applying (Section 4.1)
   * @param {Object} operation - Operation to validate
   * @returns {boolean} - Whether operation is valid
   */
  validateOperation(operation) {
    if (!operation || !operation.action) return false;
    
    switch (operation.action) {
      case 'insert':
        return operation.opId && operation.char !== undefined && operation.leftId !== undefined;
      case 'delete':
        return operation.targetId && this.characters.has(operation.targetId);
      case 'addMark':
        return operation.markId && operation.start && operation.end && operation.markType &&
               this.characters.has(operation.start.opId) && this.characters.has(operation.end.opId);
      case 'removeMark':
        return operation.markId && this.marks.has(operation.markId);
      default:
        return false;
    }
  }

  /**
   * Convert current document to operations log for synchronization
   * @returns {Array} - Array of all operations that created current state
   */
  getOperationsLog() {
    return CRDTSerializer.getOperationsLog(this.characters, this.marks, this.root);
  }

  /**
   * Merge with another Peritext document
   * @param {PeritextDocument} other - Other document to merge with
   * @returns {boolean} - Whether merge was successful
   */
  merge(other) {
    try {
      const otherOperations = other.getOperationsLog();
      let appliedCount = 0;
      
      for (const operation of otherOperations) {
        if (this.applyOperation(operation)) {
          appliedCount++;
        }
      }
      
      return appliedCount > 0;
    } catch (error) {
      console.error('Merge failed:', error);
      return false;
    }
  }

  /**
   * Create a fork of this document for branching workflows
   * @param {string} newUserId - User ID for the fork
   * @returns {PeritextDocument} - Forked document
   */
  fork(newUserId) {
    const forked = new PeritextDocument(newUserId);
    const operations = this.getOperationsLog();
    
    for (const operation of operations) {
      forked.applyOperation(operation);
    }
    
    return forked;
  }

  /**
   * Apply remote operation to this document
   * @param {Object} operation - Remote operation to apply
   * @returns {boolean} - Whether the operation was actually applied
   */
  applyOperation(operation) {
    // Create operation ID for deduplication
    const operationId = this.createOperationId(operation);
    
    // Check if we've already applied this operation
    if (this.appliedOperations.has(operationId)) {
      return false; // Already applied, skip
    }
    
    // Mark as applied before processing
    this.appliedOperations.add(operationId);
    
    try {
      switch (operation.action) {
        case 'insert':
          this.applyRemoteInsert(operation);
          return true;
        case 'delete':
          this.applyRemoteDelete(operation);
          return true;
        case 'addMark':
          this.applyRemoteMark(operation);
          return true;
        case 'removeMark':
          this.applyRemoteMarkRemoval(operation);
          return true;
        default:
          console.warn('Unknown operation type:', operation.action);
          // Remove from applied set if it's an unknown operation
          this.appliedOperations.delete(operationId);
          return false;
      }
    } catch (error) {
      console.error('Error applying operation:', error);
      // Remove from applied set if application failed
      this.appliedOperations.delete(operationId);
      return false;
    }
  }

  /**
   * Apply remote insert operation
   * Handles out-of-order delivery by buffering operations with missing dependencies
   */
  applyRemoteInsert(op) {
    // Check if we already have this operation
    if (this.characters.has(op.opId)) {
      return; // Already applied
    }

    // FIXED: Update Lamport counter to maintain causality (Lamport's algorithm)
    // When receiving operation with counter C: local_counter = max(local_counter, C)
    if (op.counter !== undefined) {
      this.counter = Math.max(this.counter, op.counter);
    }

    // Check if the leftId dependency exists
    const leftOpId = op.leftId || this.root.opId;
    if (!this.characters.has(leftOpId)) {
      // Missing dependency - buffer this operation
      console.log(`[CRDT] Buffering operation ${op.opId} (char: "${op.char}"), waiting for dependency ${leftOpId}`);

      // Check if already in pending queue
      const alreadyPending = this.pendingOperations.some(pending => pending.opId === op.opId);
      if (!alreadyPending) {
        this.pendingOperations.push(op);
        console.log(`[CRDT] Pending operations queue size: ${this.pendingOperations.length}`);
      }
      return;
    }

    const leftNode = this.characters.get(leftOpId);

    const newNode = {
      opId: op.opId,
      char: op.char,
      afterId: leftOpId,            // Immutable causal reference (originLeft)
      originRight: op.rightId,       // YATA: what was right at insertion time
      rightId: null,                 // Actual right neighbor (maintained by YATA)
      deleted: false,
      userId: op.userId,
      counter: op.counter
    };

    // YATA ordering for remote operations (extends RGA with originRight)
    // This ensures deterministic convergence and proper "insert between" semantics
    this.sequence.insertIntoSequence(newNode, leftNode);

    this.sequence.characters.set(op.opId, newNode);
    console.log(`[CRDT] Applied insert operation ${op.opId} (char: "${op.char}")`);

    // After successfully applying, check if any pending operations can now be applied
    this.processPendingOperations();
  }

  /**
   * Process pending operations that were buffered due to missing dependencies
   * This is called after successfully applying an operation to check if any
   * buffered operations can now be applied
   */
  processPendingOperations() {
    if (this.pendingOperations.length === 0) {
      return; // Nothing to process
    }

    let progress = true;
    let iterations = 0;
    const MAX_ITERATIONS = 1000; // Prevent infinite loops

    while (progress && this.pendingOperations.length > 0 && iterations < MAX_ITERATIONS) {
      progress = false;
      const remaining = [];

      for (const op of this.pendingOperations) {
        const leftOpId = op.leftId || this.root.opId;

        // Check if dependency is now available
        if (this.characters.has(leftOpId)) {
          console.log(`[CRDT] Dependency ${leftOpId} now available, applying buffered operation ${op.opId}`);

          // Don't call processPendingOperations recursively - we're already in the loop
          const oldPending = this.pendingOperations;
          this.pendingOperations = []; // Temporarily clear to prevent recursion

          this.applyRemoteInsert(op);

          // Restore pending operations (minus the ones we're processing)
          this.pendingOperations = oldPending;

          progress = true; // We made progress
        } else {
          // Dependency still missing, keep in buffer
          remaining.push(op);
        }
      }

      this.pendingOperations = remaining;
      iterations++;
    }

    if (this.pendingOperations.length > 0) {
      console.warn(`[CRDT] ${this.pendingOperations.length} operations still pending after processing. Missing dependencies:`,
        this.pendingOperations.map(op => `${op.opId} waiting for ${op.leftId}`).join(', '));
    } else {
      console.log(`[CRDT] All pending operations processed successfully`);
    }
  }

  /**
   * Apply remote delete operation
   * @param {Object} op - Delete operation
   */
  applyRemoteDelete(op) {
    // FIXED: Update Lamport counter to maintain causality
    if (op.counter !== undefined) {
      this.counter = Math.max(this.counter, op.counter);
    }

    this.delete(op.targetId);
  }

  /**
   * Add formatting mark (Peritext operation)
   * Implements anchor positions as described in Section 4.2
   * @param {Object} start - {opId: string, type: 'before'|'after'}
   * @param {Object} end - {opId: string, type: 'before'|'after'}
   * @param {string} markType - Type of mark (bold, italic, etc.)
   * @param {Object} attributes - Mark attributes
   * @param {Object} markConfig - {canOverlap: boolean, expand: boolean}
   * @returns {string} - Mark ID
   */
  addMark(start, end, markType, attributes = {}, markConfig = {canOverlap: true, expand: true}) {
    const markId = this.generateMarkId();  // Increments this.counter

    // Validate anchor positions exist
    if (!this.characters.has(start.opId) || !this.characters.has(end.opId)) {
      throw new Error(`Invalid anchor positions: ${start.opId} or ${end.opId} not found`);
    }

    const mark = {
      markId,
      start, // {opId, type: 'before'|'after'}
      end,   // {opId, type: 'before'|'after'}
      markType,
      attributes,
      canOverlap: markConfig.canOverlap,
      expand: markConfig.expand,
      deleted: false,
      userId: this.userId,
      counter: this.counter  // FIXED: Use unified counter (already incremented by generateMarkId)
    };

    this.marks.set(markId, mark);

    // FIXED: Update op-sets for ALL positions in the span (Algorithm 1 from paper)
    // This allows getMarksForCharacter() to use op-sets to determine formatting
    this.updateOpSetsForMark(mark);

    return markId;
  }

  /**
   * Remove formatting mark
   * @param {string} markId - ID of mark to remove
   */
  removeMark(markId) {
    const mark = this.marks.get(markId);
    if (mark && !mark.deleted) {
      mark.deleted = true;

      // FIXED: Update op-sets with removeMark operation (Algorithm 1 from paper)
      // This ensures proper conflict resolution for concurrent add/remove operations
      const sequence = this.getOrderedSequence();
      const startChar = sequence.find(n => n.opId === mark.start.opId);
      const endChar = sequence.find(n => n.opId === mark.end.opId);

      if (startChar && endChar) {
        const startIndex = sequence.indexOf(startChar);
        const endIndex = sequence.indexOf(endChar);

        // Update op-sets for all characters in the span
        for (let i = startIndex; i <= endIndex; i++) {
          const char = sequence[i];
          const beforeKey = `${char.opId}:before`;
          const afterKey = `${char.opId}:after`;

          // Add removeMark operation to both :before and :after op-sets
          [beforeKey, afterKey].forEach(key => {
            if (this.opSets.has(key)) {
              const opSet = this.opSets.get(key);
              opSet.add({
                type: 'removeMark',
                markId,
                userId: this.userId,
                counter: ++this.counter  // Increment counter for mark removal
              });
            }
          });
        }
      }

      console.log('Removed mark:', markId);
      return true;
    }
    return false;
  }

  /**
   * Apply remote mark operation
   * @param {Object} op - Mark operation
   */
  applyRemoteMark(op) {
    if (this.marks.has(op.markId)) {
      return; // Already applied
    }

    // FIXED: Update Lamport counter to maintain causality (same as applyRemoteInsert)
    // When receiving operation with counter C: local_counter = max(local_counter, C)
    if (op.counter !== undefined) {
      this.counter = Math.max(this.counter, op.counter);
    }

    // Handle position-based marks (new format)
    if (op.startIndex !== undefined && op.endIndex !== undefined) {
      // Resolve position indices to local opIds
      const startOpId = this.getOpIdAtIndex(op.startIndex);
      const endOpId = this.getOpIdAtIndex(op.endIndex);
      
      if (!startOpId || !endOpId) {
        console.warn(`Cannot resolve position indices for mark ${op.markId}: ${op.startIndex}-${op.endIndex}`);
        return;
      }
      
      const mark = {
        markId: op.markId,
        start: { opId: startOpId, type: 'before' },
        end: { opId: endOpId, type: 'after' },
        markType: op.markType,
        attributes: op.attributes || {},
        canOverlap: op.canOverlap !== undefined ? op.canOverlap : true,
        expand: op.expand !== undefined ? op.expand : true,
        deleted: false,
        userId: op.userId,
        counter: op.counter
      };

      this.marks.set(op.markId, mark);

      // FIXED: Update op-sets for ALL positions in the span (Algorithm 1 from paper)
      this.updateOpSetsForMark(mark);

    } else if (op.start && op.end) {
      // Handle old opId-based format (for backwards compatibility)
      if (!this.characters.has(op.start.opId) || !this.characters.has(op.end.opId)) {
        console.warn(`Missing anchors for mark ${op.markId}: ${op.start.opId} or ${op.end.opId}`);
        return;
      }

      const mark = {
        markId: op.markId,
        start: op.start,
        end: op.end,
        markType: op.markType,
        attributes: op.attributes || {},
        canOverlap: op.canOverlap !== undefined ? op.canOverlap : true,
        expand: op.expand !== undefined ? op.expand : true,
        deleted: false,
        userId: op.userId,
        counter: op.counter
      };
      
      this.marks.set(op.markId, mark);

      // FIXED: Update op-sets for ALL positions in the span (Algorithm 1 from paper)
      this.updateOpSetsForMark(mark);
    } else {
      console.warn(`Invalid mark operation format for ${op.markId}`);
      return;
    }
  }

  /**
   * Apply remote mark removal operation
   * @param {Object} op - Mark removal operation
   */
  applyRemoteMarkRemoval(op) {
    // FIXED: Update Lamport counter to maintain causality
    if (op.counter !== undefined) {
      this.counter = Math.max(this.counter, op.counter);
    }

    this.removeMark(op.markId);
  }

  /**
   * Check if two marks can overlap (based on Table 1)
   * @param {Object} mark1 - First mark
   * @param {Object} mark2 - Second mark
   * @returns {boolean} - Whether marks can overlap
   */
  canMarksOverlap(mark1, mark2) {
    // Same mark type overlap rules
    if (mark1.markType === mark2.markType) {
      switch (mark1.markType) {
        case 'bold':
        case 'italic':
        case 'underline':
          return false; // Boolean marks don't overlap meaningfully
        case 'color':
        case 'backgroundColor':
          return false; // Color conflicts need resolution
        case 'comment':
          return true;  // Comments can overlap
        default:
          return mark1.canOverlap && mark2.canOverlap;
      }
    }
    
    // Different mark types can generally overlap
    return mark1.canOverlap && mark2.canOverlap;
  }

  /**
   * Compress document by removing tombstones and optimizing marks
   * This is an optimization not in the paper but useful for performance
   * @returns {number} - Number of items removed
   */
  compress() {
    let removed = 0;

    // Build set of referenced character IDs
    const sequence = this.getOrderedSequence();
    const referencedIds = new Set();

    // Find all referenced character IDs from sequence
    for (const node of sequence) {
      if (node.afterId) referencedIds.add(node.afterId);  // Causal reference
      if (node.rightId) referencedIds.add(node.rightId);  // Sequence pointer
    }

    // Find all referenced character IDs from marks
    for (const mark of this.marks.values()) {
      referencedIds.add(mark.start.opId);
      referencedIds.add(mark.end.opId);
    }

    // Delegate sequence compression to YataSequence
    removed += this.sequence.compress(referencedIds);

    // Remove deleted marks
    for (const [markId, mark] of this.marks.entries()) {
      if (mark.deleted) {
        this.marks.delete(markId);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get current visible text content
   * @returns {string} - Current document text
   */
  getText() {
    return this.sequence.getText();
  }

  /**
   * Get ordered sequence of all nodes (including deleted/tombstones)
   * @returns {Array} - Array of character nodes in document order
   */
  getOrderedSequence() {
    return this.sequence.getOrderedSequence();
  }

  /**
   * Get visible character positions for cursor mapping
   * @returns {Array} - Array of {opId, index} for visible characters
   */
  getVisiblePositions() {
    return this.sequence.getVisiblePositions();
  }

  /**
   * Find opId at given text index
   * @param {number} index - Text index
   * @returns {string|null} - OpId at that position
   */
  getOpIdAtIndex(index) {
    return this.sequence.getOpIdAtIndex(index);
  }

  /**
   * Get the leftOpId for insertion at a cursor position
   * Cursor positions are BETWEEN characters, not AT characters
   * @param {number} cursorIndex - Cursor position (0 = before first char, 1 = after first char, etc.)
   * @returns {string} - OpId of character to insert after
   */
  getLeftOpIdForCursor(cursorIndex) {
    return this.sequence.getLeftOpIdForCursor(cursorIndex);
  }

  /**
   * Find text index of given opId
   * @param {string} opId - Operation ID
   * @returns {number} - Text index (-1 if not found or deleted)
   */
  getIndexOfOpId(opId) {
    return this.sequence.getIndexOfOpId(opId);
  }

  /**
   * Get cursor position after a given opId
   * @param {string} opId - Operation ID
   * @returns {number} - Cursor position (0 = before first char, 1 = after first char, etc.)
   */
  getCursorAfterOpId(opId) {
    return this.sequence.getCursorAfterOpId(opId);
  }

  /**
   * Get text index where an operation occurred/will occur
   * @param {Object} operation - Operation object
   * @returns {number} - Text index (-1 if not found)
   */
  getTextIndexForOperation(operation) {
    return this.sequence.getTextIndexForOperation(operation);
  }

  /**
   * Get marks that apply to a specific character position
   * FIXED: Now uses op-sets (Algorithm 1 from paper) instead of span checking
   * @param {string} opId - Character operation ID
   * @returns {Array} - Array of marks that apply to this character
   */
  getMarksForCharacter(opId) {
    // Get the op-set for this character's position
    // Use :after since we want the formatting state after this character
    const afterKey = `${opId}:after`;
    let opSet = this.opSets.get(afterKey);

    // CRITICAL: Only call findPreviousOpSet if no op-set exists at all
    // An empty op-set is a valid boundary that means "no marks here"
    // If we find an empty op-set, it means marks explicitly end before this position
    if (!opSet) {
      opSet = this.findPreviousOpSet(afterKey);
    }

    if (!opSet || opSet.size === 0) {
      return []; // No marks apply (either no op-set or explicit boundary)
    }

    // Process op-set to compute active marks
    // Collect all addMark operations, then filter by removeMark operations
    const markOps = new Map(); // markId -> latest operation

    for (const op of opSet) {
      if (op.type === 'addMark') {
        // Add or update mark operation
        const existing = markOps.get(op.markId);
        if (!existing || compareOperations(op, existing) > 0) {
          markOps.set(op.markId, op);
        }
      } else if (op.type === 'removeMark') {
        // Remove mark if it exists
        const existing = markOps.get(op.markId);
        if (existing && compareOperations(op, existing) > 0) {
          markOps.delete(op.markId);
        }
      }
    }

    // Convert mark operations to actual mark objects
    const activeMarks = [];
    for (const markId of markOps.keys()) {
      const mark = this.marks.get(markId);
      if (mark && !mark.deleted) {
        activeMarks.push(mark);
      }
    }

    return activeMarks;
  }


  /**
   * Get formatted content with marks applied (for Quill delta format)
   * @returns {Object} - Quill delta with text and formatting
   */
  getFormattedContent() {
    const sequence = this.getOrderedSequence();
    const visibleCharacters = sequence.filter(node => !node.deleted && node.char !== null);
    
    if (visibleCharacters.length === 0) {
      return { ops: [{ insert: "" }] };
    }
    
    const ops = [];
    let currentText = "";
    let currentAttributes = {};
    
    for (let i = 0; i < visibleCharacters.length; i++) {
      const char = visibleCharacters[i];
      const marks = this.getMarksForCharacter(char.opId);
      
      // Build attributes from active marks
      const attributes = {};
      for (const mark of marks) {
        if (mark.markType === 'bold') {
          attributes.bold = true;
        } else if (mark.markType === 'italic') {
          attributes.italic = true;
        } else if (mark.markType === 'underline') {
          attributes.underline = true;
        } else if (mark.markType === 'strike') {
          attributes.strike = true;
        }
        // Add other formatting types as needed
      }
      
      // If attributes changed, flush current text and start new operation
      if (JSON.stringify(attributes) !== JSON.stringify(currentAttributes)) {
        if (currentText) {
          const op = { insert: currentText };
          if (Object.keys(currentAttributes).length > 0) {
            op.attributes = currentAttributes;
          }
          ops.push(op);
          currentText = "";
        }
        currentAttributes = attributes;
      }
      
      currentText += char.char;
    }
    
    // Flush remaining text
    if (currentText) {
      const op = { insert: currentText };
      if (Object.keys(currentAttributes).length > 0) {
        op.attributes = currentAttributes;
      }
      ops.push(op);
    }
    
    return { ops };
  }

  /**
   * Generate operation object for broadcasting
   * @param {string} action - 'insert', 'delete', 'addMark', 'removeMark'
   * @param {Object} params - Action-specific parameters
   * @returns {Object} - Operation object
   */
  createOperation(action, params) {
    return CRDTSerializer.createOperation(action, params, this.userId, this.counter);
  }

  /**
   * Get current document state suitable for text editor initialization
   * @returns {Object} - Document state with content and formatting
   */
  getDocumentState() {
    return CRDTSerializer.getDocumentState(this);
  }

  /**
   * Serialize document state for persistence - Firestore compatible
   */
  serialize() {
    return CRDTSerializer.serialize(this);
  }

  /**
   * Create document from serialized state
   */
  static deserialize(data, userId) {
    return CRDTSerializer.deserialize(data, userId, PeritextDocument);
  }

  /**
   * Merge another document state into this one (for loading from persistence)
   */
  mergeDocument(otherDoc) {
    // Merge characters (into sequence)
    for (const [opId, node] of otherDoc.characters) {
      if (!this.characters.has(opId)) {
        this.sequence.characters.set(opId, { ...node });
      }
    }

    // Merge marks
    for (const [markId, mark] of otherDoc.marks) {
      if (!this.marks.has(markId)) {
        this.marks.set(markId, { ...mark });
      }
    }

    // Update counter to prevent conflicts (single unified counter)
    this.counter = Math.max(this.counter, otherDoc.counter);

    // Merge applied operations
    for (const opId of otherDoc.appliedOperations) {
      this.appliedOperations.add(opId);
    }

    // Merge op-sets
    for (const [key, opSet] of otherDoc.opSets) {
      if (!this.opSets.has(key)) {
        this.opSets.set(key, new Set(opSet));
      } else {
        for (const op of opSet) {
          this.opSets.get(key).add(op);
        }
      }
    }
  }

  /**
   * Get document state for debugging
   */
  getDebugState() {
    return {
      userId: this.userId,
      counter: this.counter,  // Single unified counter
      characterCount: this.characters.size,
      markCount: this.marks.size,
      text: this.getText(),
      sequence: this.getOrderedSequence().map(n => ({
        opId: n.opId,
        char: n.char,
        deleted: n.deleted
      })),
      marks: Array.from(this.marks.values()).map(m => ({
        markId: m.markId,
        markType: m.markType,
        start: m.start,
        end: m.end,
        deleted: m.deleted
      })),
      opSets: Object.fromEntries(
        Array.from(this.opSets.entries()).map(([key, set]) => [
          key,
          Array.from(set)
        ])
      )
    };
  }
}

export default PeritextDocument;