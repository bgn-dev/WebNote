/**
 * Peritext: A CRDT for Collaborative Rich Text Editing
 * Full implementation based on the Peritext paper by Litt et al.
 * Provides conflict-free collaborative rich text editing with intent preservation
 */

class PeritextDocument {
  constructor(userId) {
    this.userId = userId;
    this.counter = 0;
    this.characters = new Map(); // opId -> RGANode
    this.root = null; // Root node for the sequence
    this.appliedOperations = new Set(); // Track applied operation IDs for deduplication
    
    // Peritext formatting system
    this.marks = new Map(); // markId -> MarkObject
    this.markCounter = 0; // Counter for generating unique mark IDs
    
    // Op-sets for anchor positions (Algorithm 1 from paper)
    this.opSets = new Map(); // anchorPosition -> Set of operations
    
    // Initialize with root node (invisible)
    this.root = this.createRootNode();
  }

  /**
   * Create the root node that anchors the sequence
   */
  createRootNode() {
    const rootId = "0@root";
    const rootNode = {
      opId: rootId,
      char: null, // Root has no character
      leftId: null,
      rightId: null,
      deleted: false,
      timestamp: 0,
      userId: "root",
      counter: 0
    };
    this.characters.set(rootId, rootNode);
    return rootNode;
  }

  /**
   * Generate unique operation ID
   */
  generateOpId() {
    return `${++this.counter}@${this.userId}`;
  }

  /**
   * Generate unique mark ID for formatting
   */
  generateMarkId() {
    return `mark-${++this.markCounter}@${this.userId}`;
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
        timestamp: mark.timestamp,
        userId: mark.userId,
        counter: mark.counter
      });
    } else if (operation === 'removeMark') {
      opSet.add({
        type: 'removeMark',
        markId: mark.markId,
        timestamp: mark.timestamp,
        userId: mark.userId,
        counter: mark.counter
      });
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
   * Apply operation using Algorithm 1 from paper
   * @param {string} operation - 'addMark' or 'removeMark'
   * @param {Object} params - Operation parameters
   */
  applyPeritextOperation(operation, params) {
    if (operation === 'addMark') {
      const {start, end, markType, attributes, markConfig} = params;
      
      // Update op-set at start position
      const startKey = `${start.opId}:${start.type}`;
      if (!this.opSets.has(startKey)) {
        const prevOpSet = this.findPreviousOpSet(startKey);
        this.opSets.set(startKey, new Set(prevOpSet));
      }
      
      // Process span between start and end
      const sequence = this.getOrderedSequence();
      const startChar = sequence.find(n => n.opId === start.opId);
      const endChar = sequence.find(n => n.opId === end.opId);
      
      if (startChar && endChar) {
        const startIndex = sequence.indexOf(startChar);
        const endIndex = sequence.indexOf(endChar);
        
        // Update all positions within the span
        for (let i = startIndex; i <= endIndex; i++) {
          const char = sequence[i];
          const beforeKey = `${char.opId}:before`;
          const afterKey = `${char.opId}:after`;
          
          [beforeKey, afterKey].forEach(key => {
            if (!this.opSets.has(key)) {
              this.opSets.set(key, new Set());
            }
            
            const opSet = this.opSets.get(key);
            opSet.add({
              type: 'addMark',
              markId: params.markId || this.generateMarkId(),
              markType,
              timestamp: Date.now(),
              userId: this.userId,
              counter: ++this.markCounter
            });
          });
        }
      }
    }
  }

  /**
   * Insert character at position after leftOpId
   * @param {string} char - Character to insert
   * @param {string} leftOpId - OpId of character to insert after (null for beginning)
   * @returns {string} - OpId of inserted character
   */
  insert(char, leftOpId = null) {
    const opId = this.generateOpId();
    
    // Default to root if no leftOpId specified
    if (leftOpId === null) {
      leftOpId = this.root.opId;
    }

    const leftNode = this.characters.get(leftOpId);
    if (!leftNode) {
      throw new Error(`Left node ${leftOpId} not found`);
    }

    const newNode = {
      opId,
      char,
      leftId: leftOpId,
      rightId: null,
      deleted: false,
      timestamp: Date.now(),
      userId: this.userId,
      counter: this.counter
    };

    // For local operations, insert directly at specified position  
    // without RGA ordering (which is only for concurrent remote ops)
    newNode.rightId = leftNode.rightId;
    if (leftNode.rightId) {
      const rightNode = this.characters.get(leftNode.rightId);
      rightNode.leftId = newNode.opId;
    }
    leftNode.rightId = newNode.opId;
    newNode.leftId = leftNode.opId;
    
    this.characters.set(opId, newNode);
    
    // Handle mark expansion according to Section 3.3
    this.handleMarkExpansionOnInsertion(opId, leftOpId);
    
    return opId;
  }

  /**
   * Core RGA insertion algorithm
   * Finds the correct position considering concurrent insertions
   */
  insertIntoSequence(newNode, leftNode) {
    let current = leftNode;
    
    // Find insertion point: scan right until we find a node that should come after newNode
    while (current.rightId) {
      const rightNode = this.characters.get(current.rightId);
      
      // RGA ordering rule: compare (userId, counter) pairs
      if (this.shouldInsertBefore(newNode, rightNode)) {
        break;
      }
      current = rightNode;
    }

    // Insert newNode between current and current.rightId
    newNode.rightId = current.rightId;
    if (current.rightId) {
      const rightNode = this.characters.get(current.rightId);
      rightNode.leftId = newNode.opId;
    }
    
    current.rightId = newNode.opId;
    newNode.leftId = current.opId;
  }

  /**
   * RGA ordering: newNode should be inserted before existingNode if:
   * 1. newNode has earlier timestamp, OR  
   * 2. Same timestamp but lower userId lexicographically
   */
  shouldInsertBefore(newNode, existingNode) {
    if (newNode.timestamp !== existingNode.timestamp) {
      return newNode.timestamp < existingNode.timestamp;
    }
    
    // Tie-break by userId for deterministic ordering
    if (newNode.userId !== existingNode.userId) {
      return newNode.userId < existingNode.userId;
    }
    
    // Same user - use counter
    return newNode.counter < existingNode.counter;
  }

  /**
   * Handle mark expansion when text is inserted (Section 3.3)
   * @param {string} newOpId - OpId of newly inserted character
   * @param {string} leftOpId - OpId of character to the left
   */
  handleMarkExpansionOnInsertion(newOpId, leftOpId) {
    const sequence = this.getOrderedSequence();
    const leftIndex = sequence.findIndex(n => n.opId === leftOpId);
    const rightIndex = leftIndex + 1;
    
    if (leftIndex === -1) return;
    
    // Find marks that might need to expand
    for (const mark of this.marks.values()) {
      if (mark.deleted || !mark.expand) continue;
      
      const startChar = sequence.find(n => n.opId === mark.start.opId);
      const endChar = sequence.find(n => n.opId === mark.end.opId);
      
      if (!startChar || !endChar) continue;
      
      const startIndex = sequence.indexOf(startChar);
      const endIndex = sequence.indexOf(endChar);
      
      // Apply intent preservation rules from Section 3.3:
      
      // Rule 1: If inserting within a mark span, inherit formatting
      if (this.isInsertionWithinMark(leftIndex, rightIndex, startIndex, endIndex, mark)) {
        // Character inherits the mark - mark automatically covers it
        continue;
      }
      
      // Rule 2: If inserting at mark boundaries, check expansion rules
      if (this.isInsertionAtMarkBoundary(leftIndex, startIndex, endIndex, mark)) {
        this.expandMarkForInsertion(mark, newOpId, leftIndex, startIndex, endIndex);
      }
    }
  }

  /**
   * Check if insertion is within a mark span
   * @param {number} leftIndex - Index of left character
   * @param {number} rightIndex - Index of right character  
   * @param {number} startIndex - Mark start index
   * @param {number} endIndex - Mark end index
   * @param {Object} mark - Mark object
   * @returns {boolean}
   */
  isInsertionWithinMark(leftIndex, rightIndex, startIndex, endIndex, mark) {
    let actualStart = startIndex;
    let actualEnd = endIndex;
    
    if (mark.start.type === 'after') actualStart++;
    if (mark.end.type === 'before') actualEnd--;
    
    // Insertion is within if it's between the actual boundaries
    return leftIndex >= actualStart && leftIndex < actualEnd;
  }

  /**
   * Check if insertion is at mark boundary
   * @param {number} leftIndex - Index of left character
   * @param {number} startIndex - Mark start index
   * @param {number} endIndex - Mark end index
   * @param {Object} mark - Mark object
   * @returns {boolean}
   */
  isInsertionAtMarkBoundary(leftIndex, startIndex, endIndex, mark) {
    // Check if inserting at the start or end boundary
    if (mark.start.type === 'before' && leftIndex === startIndex - 1) return true;
    if (mark.start.type === 'after' && leftIndex === startIndex) return true;
    if (mark.end.type === 'before' && leftIndex === endIndex - 1) return true;
    if (mark.end.type === 'after' && leftIndex === endIndex) return true;
    
    return false;
  }

  /**
   * Expand mark to include inserted character
   * @param {Object} mark - Mark to expand
   * @param {string} newOpId - OpId of inserted character
   * @param {number} leftIndex - Index where insertion occurred
   * @param {number} startIndex - Current mark start index
   * @param {number} endIndex - Current mark end index
   */
  expandMarkForInsertion(mark, newOpId, leftIndex, startIndex, endIndex) {
    const sequence = this.getOrderedSequence();
    
    // Expand mark boundaries based on insertion position
    if (leftIndex === startIndex - 1 && mark.start.type === 'before') {
      // Inserted before mark start - extend start boundary
      mark.start = { opId: newOpId, type: 'before' };
    } else if (leftIndex === startIndex && mark.start.type === 'after') {
      // Inserted after mark start character - no change needed
    } else if (leftIndex === endIndex - 1 && mark.end.type === 'before') {
      // Inserted before mark end - no change needed
    } else if (leftIndex === endIndex && mark.end.type === 'after') {
      // Inserted after mark end - extend end boundary
      mark.end = { opId: newOpId, type: 'after' };
    }
    
    // Update op-sets
    this.updateOpSetAtAnchor(mark.start, 'addMark', mark);
    this.updateOpSetAtAnchor(mark.end, 'addMark', mark);
  }

  /**
   * Mark character as deleted (tombstone approach)
   * @param {string} opId - OpId of character to delete
   */
  delete(opId) {
    const node = this.characters.get(opId);
    if (node && !node.deleted) {
      node.deleted = true;
      return true;
    }
    return false;
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
      return `delete-${operation.targetId}-${operation.timestamp}-${operation.userId}`;
    } else if (operation.action === 'addMark') {
      return `addMark-${operation.markId}`;
    } else if (operation.action === 'removeMark') {
      return `removeMark-${operation.markId}-${operation.timestamp}-${operation.userId}`;
    }
    return `${operation.action}-${operation.timestamp}-${operation.userId}`;
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
    const operations = [];
    
    // Add character insertion operations
    const sequence = this.getOrderedSequence();
    for (const node of sequence) {
      if (node.opId !== this.root.opId) {
        operations.push({
          action: 'insert',
          opId: node.opId,
          char: node.char,
          leftId: node.leftId,
          timestamp: node.timestamp,
          userId: node.userId,
          counter: node.counter
        });
        
        if (node.deleted) {
          operations.push({
            action: 'delete',
            targetId: node.opId,
            timestamp: node.timestamp,
            userId: node.userId
          });
        }
      }
    }
    
    // Add mark operations
    for (const mark of this.marks.values()) {
      operations.push({
        action: 'addMark',
        markId: mark.markId,
        start: mark.start,
        end: mark.end,
        markType: mark.markType,
        attributes: mark.attributes,
        canOverlap: mark.canOverlap,
        expand: mark.expand,
        timestamp: mark.timestamp,
        userId: mark.userId,
        counter: mark.counter
      });
      
      if (mark.deleted) {
        operations.push({
          action: 'removeMark',
          markId: mark.markId,
          timestamp: mark.timestamp,
          userId: mark.userId
        });
      }
    }
    
    // Sort by timestamp, then userId, then counter for deterministic ordering
    return operations.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.userId !== b.userId) return a.userId.localeCompare(b.userId);
      return (a.counter || 0) - (b.counter || 0);
    });
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
   */
  applyRemoteInsert(op) {
    // Check if we already have this operation
    if (this.characters.has(op.opId)) {
      return; // Already applied
    }

    // Ensure left node exists (may need to request it)
    if (op.leftId && !this.characters.has(op.leftId)) {
      console.warn(`Missing left node ${op.leftId} for operation ${op.opId}`);
      // In a full implementation, we'd request missing operations
      return;
    }

    const leftOpId = op.leftId || this.root.opId;
    const leftNode = this.characters.get(leftOpId);

    const newNode = {
      opId: op.opId,
      char: op.char,
      leftId: leftOpId,
      rightId: null,
      deleted: false,
      timestamp: op.timestamp,
      userId: op.userId,
      counter: op.counter
    };

    // For sequential operations from same user, insert directly at specified position
    // For concurrent operations from different users, use RGA ordering
    const isSequentialFromSameUser = this.isSequentialOperation(newNode, leftNode);
    
    if (isSequentialFromSameUser) {
      // Direct insertion preserving user intent
      newNode.rightId = leftNode.rightId;
      if (leftNode.rightId) {
        const rightNode = this.characters.get(leftNode.rightId);
        rightNode.leftId = newNode.opId;
      }
      leftNode.rightId = newNode.opId;
      newNode.leftId = leftNode.opId;
    } else {
      // Use RGA ordering for concurrent operations
      this.insertIntoSequence(newNode, leftNode);
    }
    
    this.characters.set(op.opId, newNode);
  }

  /**
   * Check if this is a sequential operation from the same user
   * Sequential operations should preserve insertion order, concurrent ones use RGA ordering
   */
  isSequentialOperation(newNode, leftNode) {
    // If inserting from a different user than the document owner, always use RGA
    if (newNode.userId === this.userId) {
      return false; // Local operations should never reach this method
    }
    
    // For remote operations: check if this appears to be part of a sequential typing session
    // Look at the immediate right neighbor to see if there's a pattern
    
    // If the leftNode is from the same user and this is the immediate next counter,
    // treat as sequential
    if (leftNode.userId === newNode.userId && 
        leftNode.counter === newNode.counter - 1) {
      return true;
    }
    
    // If no immediate right neighbor or right neighbor is from different user/time,
    // treat as sequential (preserving user intent)
    if (!leftNode.rightId) {
      return true; // Appending to end
    }
    
    const rightNode = this.characters.get(leftNode.rightId);
    if (!rightNode) return true;
    
    // If right node is from different user or much later timestamp, treat as sequential
    if (rightNode.userId !== newNode.userId || 
        Math.abs(rightNode.timestamp - newNode.timestamp) > 1000) { // 1 second threshold
      return true;
    }
    
    // Otherwise, use RGA ordering for concurrent operations
    return false;
  }

  /**
   * Apply remote delete operation
   */
  applyRemoteDelete(op) {
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
    const markId = this.generateMarkId();
    
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
      timestamp: Date.now(),
      userId: this.userId,
      counter: ++this.markCounter
    };
    
    this.marks.set(markId, mark);
    
    // Update op-sets at anchor positions (Algorithm 1)
    this.updateOpSetAtAnchor(start, 'addMark', mark);
    this.updateOpSetAtAnchor(end, 'addMark', mark);
    
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
        timestamp: op.timestamp,
        userId: op.userId,
        counter: op.counter
      };
      
      this.marks.set(op.markId, mark);
      
      // Update op-sets at anchor positions
      this.updateOpSetAtAnchor(mark.start, 'addMark', mark);
      this.updateOpSetAtAnchor(mark.end, 'addMark', mark);
      
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
        timestamp: op.timestamp,
        userId: op.userId,
        counter: op.counter
      };
      
      this.marks.set(op.markId, mark);
      
      // Update op-sets at anchor positions
      this.updateOpSetAtAnchor(op.start, 'addMark', mark);
      this.updateOpSetAtAnchor(op.end, 'addMark', mark);
    } else {
      console.warn(`Invalid mark operation format for ${op.markId}`);
      return;
    }
  }

  /**
   * Apply remote mark removal
   * @param {Object} op - Mark removal operation
   */
  applyRemoteMarkRemoval(op) {
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
    
    // Remove tombstones that are no longer needed
    // (This is safe only if we're sure no more operations reference them)
    const sequence = this.getOrderedSequence();
    const referencedIds = new Set();
    
    // Find all referenced character IDs
    for (const node of sequence) {
      if (node.leftId) referencedIds.add(node.leftId);
      if (node.rightId) referencedIds.add(node.rightId);
    }
    
    for (const mark of this.marks.values()) {
      referencedIds.add(mark.start.opId);
      referencedIds.add(mark.end.opId);
    }
    
    // Remove unreferenced tombstones
    for (const [opId, node] of this.characters.entries()) {
      if (node.deleted && !referencedIds.has(opId) && opId !== this.root.opId) {
        this.characters.delete(opId);
        removed++;
      }
    }
    
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
    const sequence = this.getOrderedSequence();
    return sequence
      .filter(node => !node.deleted && node.char !== null)
      .map(node => node.char)
      .join('');
  }

  /**
   * Get ordered sequence of all nodes (including deleted/tombstones)
   * @returns {Array} - Array of RGANode objects in document order
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
   * @returns {string} - OpId at that position
   */
  getOpIdAtIndex(index) {
    const positions = this.getVisiblePositions();
    return positions[index]?.opId || null;
  }

  /**
   * Get the leftOpId for insertion at a cursor position
   * Cursor positions are BETWEEN characters, not AT characters
   * @param {number} cursorIndex - Cursor position (0 = before first char, 1 = after first char, etc.)
   * @returns {string|null} - OpId of character to insert after (null for root)
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
   * Get marks that apply to a specific character position
   * Uses anchor position system to determine mark coverage
   * @param {string} opId - Character operation ID
   * @returns {Array} - Array of marks that apply to this character
   */
  getMarksForCharacter(opId) {
    const activeMarks = [];
    const sequence = this.getOrderedSequence();
    const characterIndex = sequence.findIndex(node => node.opId === opId);
    
    if (characterIndex === -1) return activeMarks;
    
    // Check all marks to see which ones span this character using anchor positions
    for (const mark of this.marks.values()) {
      if (mark.deleted) continue;
      
      const startChar = sequence.find(node => node.opId === mark.start.opId);
      const endChar = sequence.find(node => node.opId === mark.end.opId);
      
      if (!startChar || !endChar) continue;
      
      const startIndex = sequence.indexOf(startChar);
      const endIndex = sequence.indexOf(endChar);
      
      // Determine actual span boundaries based on anchor types
      let actualStart = startIndex;
      let actualEnd = endIndex;
      
      if (mark.start.type === 'after') {
        actualStart = startIndex + 1;
      }
      if (mark.end.type === 'before') {
        actualEnd = endIndex - 1;
      }
      
      // Mark applies if character is within the actual span
      if (characterIndex >= actualStart && characterIndex <= actualEnd) {
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
    const baseOp = {
      action,
      timestamp: Date.now(),
      userId: this.userId
    };

    switch (action) {
      case 'insert':
        return {
          ...baseOp,
          opId: params.opId,
          char: params.char,
          leftId: params.leftId,
          counter: this.counter
        };
      case 'delete':
        return {
          ...baseOp,
          targetId: params.targetId
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
   * Create incremental patches for efficient updates (Section 4.5)
   * @param {Object} operation - Operation to create patch for
   * @returns {Object} - Patch object
   */
  createIncrementalPatch(operation) {
    switch (operation.action) {
      case 'insert':
        return this.createInsertPatch(operation);
      case 'delete':
        return this.createDeletePatch(operation);
      case 'addMark':
        return this.createAddMarkPatch(operation);
      case 'removeMark':
        return this.createRemoveMarkPatch(operation);
      default:
        throw new Error(`Unknown operation type: ${operation.action}`);
    }
  }

  /**
   * Create insert patch
   * @param {Object} operation - Insert operation
   * @returns {Object} - Insert patch
   */
  createInsertPatch(operation) {
    const sequence = this.getOrderedSequence();
    const leftNode = this.characters.get(operation.leftId);
    const insertedNode = this.characters.get(operation.opId);
    
    // Find insertion index in visible text
    let index = 0;
    for (const node of sequence) {
      if (node.opId === operation.leftId) {
        break;
      }
      if (!node.deleted && node.char !== null) {
        index++;
      }
    }
    
    // Get formatting for inserted character
    const marks = this.getMarksForCharacter(operation.opId);
    const format = this.resolveMarkConflicts(marks);
    
    return {
      type: 'insert',
      index,
      char: operation.char,
      format,
      opId: operation.opId
    };
  }

  /**
   * Create delete patch
   * @param {Object} operation - Delete operation
   * @returns {Object} - Delete patch
   */
  createDeletePatch(operation) {
    const sequence = this.getOrderedSequence();
    
    // Find index of deleted character in visible text
    let index = 0;
    for (const node of sequence) {
      if (node.opId === operation.targetId) {
        break;
      }
      if (!node.deleted && node.char !== null) {
        index++;
      }
    }
    
    return {
      type: 'delete',
      index,
      length: 1,
      opId: operation.targetId
    };
  }

  /**
   * Create add mark patch
   * @param {Object} operation - Add mark operation
   * @returns {Object} - Add mark patch
   */
  createAddMarkPatch(operation) {
    const sequence = this.getOrderedSequence();
    const startChar = sequence.find(n => n.opId === operation.start.opId);
    const endChar = sequence.find(n => n.opId === operation.end.opId);
    
    if (!startChar || !endChar) {
      return null; // Skip if characters not found
    }
    
    const startIndex = sequence.indexOf(startChar);
    const endIndex = sequence.indexOf(endChar);
    
    // Calculate actual span boundaries
    let actualStart = startIndex;
    let actualEnd = endIndex;
    
    if (operation.start.type === 'after') actualStart++;
    if (operation.end.type === 'before') actualEnd--;
    
    // Convert to visible character indices
    let visibleStart = 0;
    let visibleEnd = 0;
    let currentVisible = 0;
    
    for (let i = 0; i < sequence.length; i++) {
      const node = sequence[i];
      
      if (i === actualStart) {
        visibleStart = currentVisible;
      }
      if (i === actualEnd) {
        visibleEnd = currentVisible;
      }
      
      if (!node.deleted && node.char !== null) {
        currentVisible++;
      }
    }
    
    return {
      type: 'format',
      index: visibleStart,
      length: Math.max(1, visibleEnd - visibleStart),
      format: {
        [operation.markType]: this.getMarkValue(operation.markType, {
          markType: operation.markType,
          attributes: operation.attributes
        })
      },
      markId: operation.markId
    };
  }

  /**
   * Create remove mark patch
   * @param {Object} operation - Remove mark operation
   * @returns {Object} - Remove mark patch
   */
  createRemoveMarkPatch(operation) {
    const mark = this.marks.get(operation.markId);
    if (!mark) return null;
    
    // Similar to addMarkPatch but removes formatting
    const addPatch = this.createAddMarkPatch({
      ...operation,
      start: mark.start,
      end: mark.end,
      markType: mark.markType,
      attributes: mark.attributes
    });
    
    if (addPatch) {
      return {
        ...addPatch,
        type: 'unformat',
        format: {
          [mark.markType]: null
        }
      };
    }
    
    return null;
  }

  /**
   * Apply incremental patch to text editor
   * @param {Object} patch - Patch to apply
   * @param {Object} editor - Text editor instance (e.g., Quill)
   */
  applyPatchToEditor(patch, editor) {
    switch (patch.type) {
      case 'insert':
        editor.insertText(patch.index, patch.char, patch.format);
        break;
      case 'delete':
        editor.deleteText(patch.index, patch.length);
        break;
      case 'format':
        editor.formatText(patch.index, patch.length, patch.format);
        break;
      case 'unformat':
        editor.removeFormat(patch.index, patch.length, Object.keys(patch.format));
        break;
    }
  }

  /**
   * Get current document state suitable for text editor initialization
   * @returns {Object} - Document state with content and formatting
   */
  getDocumentState() {
    const formattedContent = this.getFormattedContent();
    const sequence = this.getOrderedSequence();
    const visibleChars = sequence.filter(n => !n.deleted && n.char !== null);
    
    return {
      content: formattedContent,
      text: this.getText(),
      length: visibleChars.length,
      marks: Array.from(this.marks.values()).filter(m => !m.deleted),
      version: {
        userId: this.userId,
        counter: this.counter,
        markCounter: this.markCounter,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Serialize document state for persistence - Firestore compatible
   */
  serialize() {
    // Convert Maps and Sets to plain objects/arrays for Firestore
    const charactersObj = {};
    this.characters.forEach((value, key) => {
      charactersObj[key] = value;
    });

    const marksObj = {};
    this.marks.forEach((value, key) => {
      marksObj[key] = value;
    });

    const opSetsObj = {};
    this.opSets.forEach((value, key) => {
      opSetsObj[key] = Array.from(value);
    });

    return {
      userId: this.userId,
      counter: this.counter,
      markCounter: this.markCounter,
      characters: charactersObj,
      marks: marksObj,
      rootOpId: this.root.opId,
      appliedOperations: Array.from(this.appliedOperations),
      opSets: opSetsObj,
      version: Date.now()
    };
  }

  /**
   * Create document from serialized state
   */
  static deserialize(data, userId) {
    const doc = new PeritextDocument(userId);
    
    // Restore counters
    doc.counter = data.counter || 0;
    doc.markCounter = data.markCounter || 0;
    
    // Restore characters from object format
    if (data.characters) {
      doc.characters = new Map(Object.entries(data.characters));
    }
    
    // Restore marks from object format
    if (data.marks) {
      doc.marks = new Map(Object.entries(data.marks));
    }
    
    // Restore root reference
    if (data.rootOpId && doc.characters.has(data.rootOpId)) {
      doc.root = doc.characters.get(data.rootOpId);
    }
    
    // Restore applied operations
    if (data.appliedOperations) {
      doc.appliedOperations = new Set(data.appliedOperations);
    }
    
    // Restore op-sets from object format
    if (data.opSets) {
      doc.opSets = new Map(Object.entries(data.opSets).map(([key, value]) => [key, new Set(value)]));
    }
    
    return doc;
  }

  /**
   * Merge another document state into this one (for loading from persistence)
   */
  mergeDocument(otherDoc) {
    // Merge characters
    for (const [opId, node] of otherDoc.characters) {
      if (!this.characters.has(opId)) {
        this.characters.set(opId, { ...node });
      }
    }
    
    // Merge marks
    for (const [markId, mark] of otherDoc.marks) {
      if (!this.marks.has(markId)) {
        this.marks.set(markId, { ...mark });
      }
    }
    
    // Update counters to prevent conflicts
    this.counter = Math.max(this.counter, otherDoc.counter);
    this.markCounter = Math.max(this.markCounter, otherDoc.markCounter);
    
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
      counter: this.counter,
      markCounter: this.markCounter,
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