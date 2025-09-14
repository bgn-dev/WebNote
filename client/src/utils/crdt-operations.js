/**
 * CRDT Operations Utilities
 * Functions for generating and processing CRDT operations from Quill editor changes
 */

// Generate formatting operations from Quill delta
export const generateFormattingOperations = (delta, rgaDocument) => {
  const operations = [];
  let currentIndex = 0;
  
  for (const op of delta.ops) {
    if (op.retain && op.attributes) {
      // This is a formatting operation - apply attributes to the retained range
      const length = op.retain;
      // For mark operations, we need to use position indices that can be resolved by each peer
      const startIndex = currentIndex;
      const endIndex = currentIndex + length - 1;
      
      // Generate mark operations for each attribute
      for (const [attrName, attrValue] of Object.entries(op.attributes)) {
        if (attrValue) {
          // Add mark using position indices instead of specific opIds
          const markId = rgaDocument.generateMarkId();
          const markOp = {
            action: 'addMark',
            markId,
            startIndex, // Use position index instead of opId
            endIndex,   // Use position index instead of opId
            markType: attrName,
            attributes: { [attrName]: attrValue },
            timestamp: Date.now(),
            userId: rgaDocument.userId,
            counter: rgaDocument.counter
          };
          operations.push(markOp);
        } else {
          // Remove mark (find existing marks and remove them)  
          const startIndex = currentIndex;
          const endIndex = currentIndex + length - 1;
          
          // Find marks to split/remove according to Peritext paper rules
          for (const mark of rgaDocument.marks.values()) {
            if (mark.deleted || mark.markType !== attrName) continue;
            
            // Get current position indices for this mark
            const sequence = rgaDocument.getOrderedSequence();
            const markStartIndex = sequence.findIndex(node => node.opId === mark.start.opId);
            const markEndIndex = sequence.findIndex(node => node.opId === mark.end.opId);
            
            // Check if this mark overlaps with the range we're unformatting
            if (markStartIndex <= endIndex && markEndIndex >= startIndex) {
              // Calculate intersection between mark and unformat range
              const intersectionStart = Math.max(markStartIndex, startIndex);
              const intersectionEnd = Math.min(markEndIndex, endIndex);
              
              // Remove the original mark
              const removeOp = {
                action: 'removeMark',
                markId: mark.markId,
                timestamp: Date.now(),
                userId: rgaDocument.userId,
                counter: rgaDocument.counter
              };
              operations.push(removeOp);
              
              // Create new marks for the parts that should remain formatted
              // Left part: from mark start to intersection start
              if (markStartIndex < intersectionStart) {
                const leftMarkId = rgaDocument.generateMarkId();
                const leftMarkOp = {
                  action: 'addMark',
                  markId: leftMarkId,
                  startIndex: markStartIndex,
                  endIndex: intersectionStart - 1,
                  markType: attrName,
                  attributes: mark.attributes,
                  timestamp: Date.now(),
                  userId: rgaDocument.userId,
                  counter: rgaDocument.counter
                };
                operations.push(leftMarkOp);
              }
              
              // Right part: from intersection end to mark end
              if (intersectionEnd < markEndIndex) {
                const rightMarkId = rgaDocument.generateMarkId();
                const rightMarkOp = {
                  action: 'addMark',
                  markId: rightMarkId,
                  startIndex: intersectionEnd + 1,
                  endIndex: markEndIndex,
                  markType: attrName,
                  attributes: mark.attributes,
                  timestamp: Date.now(),
                  userId: rgaDocument.userId,
                  counter: rgaDocument.counter
                };
                operations.push(rightMarkOp);
              }
            }
          }
        }
      }
      currentIndex += length;
    } else if (op.retain) {
      currentIndex += op.retain;
    } else if (op.insert) {
      currentIndex += typeof op.insert === 'string' ? op.insert.length : 1;
    }
  }
  
  return operations;
};

// Generate RGA operations from Quill delta operations
export const generateOperationsFromQuillDelta = (delta, rgaDocument) => {
  const operations = [];
  let currentIndex = 0;
  
  for (const op of delta.ops) {
    if (op.retain) {
      currentIndex += op.retain;
    } else if (op.insert) {
      const text = typeof op.insert === 'string' ? op.insert : '';
      
      let leftOpId = rgaDocument.getLeftOpIdForCursor(currentIndex);
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        console.log(`[SENDER] ${char}: leftOpId=${leftOpId}`);
        
        // Use proper CRDT insert method
        const actualOpId = rgaDocument.insert(char, leftOpId);
        console.log(`[SENDER] After insert: "${rgaDocument.getText()}" (opId: ${actualOpId})`);
        
        // Create operation for broadcasting with the actual opId
        const operation = rgaDocument.createOperation('insert', {
          opId: actualOpId,
          char,
          leftId: leftOpId
        });
        operations.push(operation);
        leftOpId = actualOpId;
        currentIndex++;
      }
    } else if (op.delete) {
      for (let i = 0; i < op.delete; i++) {
        const opId = rgaDocument.getOpIdAtIndex(currentIndex);
        if (opId) {
          const operation = rgaDocument.createOperation('delete', {
            targetId: opId
          });
          rgaDocument.applyRemoteDelete(operation);
          operations.push(operation);
        }
      }
    }
  }
  
  return operations;
};

// Helper function to adjust cursor position for operations
export const adjustCursorForOperation = (originalRange, operation, rgaDocument) => {
  if (!originalRange || !operation || !rgaDocument) {
    return originalRange;
  }

  const opTextIndex = rgaDocument.getTextIndexForOperation(operation);
  if (opTextIndex === -1) {
    return originalRange; // Operation position unknown, no adjustment
  }

  let adjustedIndex = originalRange.index;
  let adjustedLength = originalRange.length || 0;

  // Adjust cursor index based on operation type and position
  if (operation.action === 'insert') {
    // If operation is before or at cursor, shift cursor forward
    if (opTextIndex <= adjustedIndex) {
      adjustedIndex += 1;
    }
    // If operation is within selection, extend selection
    else if (adjustedLength > 0 && opTextIndex < adjustedIndex + adjustedLength) {
      adjustedLength += 1;
    }
  } else if (operation.action === 'delete') {
    // If deletion is before cursor, shift cursor backward
    if (opTextIndex < adjustedIndex) {
      adjustedIndex = Math.max(0, adjustedIndex - 1);
    }
    // If deletion is at cursor position, cursor stays at same position
    else if (opTextIndex === adjustedIndex) {
      // Cursor stays at same index (now pointing to next character)
    }
    // If deletion is within selection, shrink selection
    else if (adjustedLength > 0 && opTextIndex < adjustedIndex + adjustedLength) {
      adjustedLength = Math.max(0, adjustedLength - 1);
    }
  }

  // Ensure cursor doesn't exceed document bounds
  const newDocumentLength = rgaDocument.getText().length;
  adjustedIndex = Math.min(adjustedIndex, newDocumentLength);
  adjustedLength = Math.min(adjustedLength, newDocumentLength - adjustedIndex);

  return {
    index: adjustedIndex,
    length: adjustedLength
  };
};