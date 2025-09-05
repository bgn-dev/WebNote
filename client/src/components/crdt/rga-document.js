/**
 * RGA (Replicated Growable Array) CRDT Implementation
 * Based on the RGA algorithm described in academic literature
 * Provides conflict-free collaborative text editing
 */

class RGADocument {
  constructor(userId) {
    this.userId = userId;
    this.counter = 0;
    this.characters = new Map(); // opId -> RGANode
    this.root = null; // Root node for the sequence
    this.appliedOperations = new Set(); // Track applied operation IDs for deduplication
    
    // Peritext formatting system
    this.marks = new Map(); // markId -> MarkObject
    this.markCounter = 0; // Counter for generating unique mark IDs
    
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
    return `${++this.markCounter}@${this.userId}`;
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

    // Insert into the sequence using RGA algorithm
    this.insertIntoSequence(newNode, leftNode);
    this.characters.set(opId, newNode);
    
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

    this.insertIntoSequence(newNode, leftNode);
    this.characters.set(op.opId, newNode);
  }

  /**
   * Apply remote delete operation
   */
  applyRemoteDelete(op) {
    this.delete(op.targetId);
  }

  /**
   * Add formatting mark (Peritext operation)
   * @param {string} startOpId - OpId of character where mark starts
   * @param {string} endOpId - OpId of character where mark ends  
   * @param {string} markType - Type of mark (bold, italic, etc.)
   * @param {Object} attributes - Mark attributes
   * @returns {string} - Mark ID
   */
  addMark(startOpId, endOpId, markType, attributes = {}) {
    const markId = this.generateMarkId();
    
    // Validate anchor positions exist
    if (!this.characters.has(startOpId) || !this.characters.has(endOpId)) {
      throw new Error(`Invalid anchor positions: ${startOpId} or ${endOpId} not found`);
    }
    
    const mark = {
      markId,
      startOpId,
      endOpId,
      markType,
      attributes,
      deleted: false,
      timestamp: Date.now(),
      userId: this.userId
    };
    
    this.marks.set(markId, mark);
    console.log('Added mark:', mark);
    
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
    
    // Ensure anchor positions exist
    if (!this.characters.has(op.startOpId) || !this.characters.has(op.endOpId)) {
      console.warn(`Missing anchors for mark ${op.markId}: ${op.startOpId} or ${op.endOpId}`);
      return;
    }
    
    const mark = {
      markId: op.markId,
      startOpId: op.startOpId,
      endOpId: op.endOpId,
      markType: op.markType,
      attributes: op.attributes || {},
      deleted: false,
      timestamp: op.timestamp,
      userId: op.userId
    };
    
    this.marks.set(op.markId, mark);
    console.log('Applied remote mark:', mark);
  }

  /**
   * Apply remote mark removal
   * @param {Object} op - Mark removal operation
   */
  applyRemoteMarkRemoval(op) {
    this.removeMark(op.markId);
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
   * Get marks that apply to a specific character position
   * @param {string} opId - Character operation ID
   * @returns {Array} - Array of marks that apply to this character
   */
  getMarksForCharacter(opId) {
    const activeMarks = [];
    const sequence = this.getOrderedSequence();
    const characterIndex = sequence.findIndex(node => node.opId === opId);
    
    if (characterIndex === -1) return activeMarks;
    
    // Check all marks to see which ones span this character
    for (const mark of this.marks.values()) {
      if (mark.deleted) continue;
      
      const startIndex = sequence.findIndex(node => node.opId === mark.startOpId);
      const endIndex = sequence.findIndex(node => node.opId === mark.endOpId);
      
      // Mark applies if character is within the span (inclusive start, inclusive end)
      if (startIndex !== -1 && endIndex !== -1 && 
          characterIndex >= startIndex && characterIndex <= endIndex) {
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
   * @param {string} action - 'insert' or 'delete'
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
          startOpId: params.startOpId,
          endOpId: params.endOpId,
          markType: params.markType,
          attributes: params.attributes || {}
        };
      case 'removeMark':
        return {
          ...baseOp,
          markId: params.markId
        };
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Get document state for debugging
   */
  getDebugState() {
    return {
      userId: this.userId,
      counter: this.counter,
      characterCount: this.characters.size,
      text: this.getText(),
      sequence: this.getOrderedSequence().map(n => ({
        opId: n.opId,
        char: n.char,
        deleted: n.deleted
      }))
    };
  }
}

export default RGADocument;