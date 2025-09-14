import { useState, useEffect, useRef, useCallback } from 'react';
import { firestore } from '../firebase/config';
import { updateDoc, getDoc, doc, onSnapshot, setDoc } from "@firebase/firestore";
import PeritextDocument from '../components/crdt/peritext-document';

/**
 * Custom hook for managing document persistence and Firestore synchronization
 * Handles auto-save, loading, and real-time sync with Firebase
 */
export function useDocumentPersistence(rgaDoc, noteID, user, noteTitle, quillRef, isApplyingRemoteChange, lastAppliedText) {
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'unsaved'
  const saveTimeoutRef = useRef(null);
  const lastSavedState = useRef(null);
  const hasLoadedInitialState = useRef(false);

  // Auto-save document state to Firestore with debouncing
  const saveDocumentState = useCallback(async (rgaDocument) => {
    if (!rgaDocument || !noteID) {
      console.log('Cannot save - missing rgaDocument or noteID:', { rgaDocument: !!rgaDocument, noteID });
      return;
    }
    
    try {
      setSaveStatus('saving');
      
      const serializedState = rgaDocument.serialize();
      const currentStateHash = JSON.stringify(serializedState);
      const plainText = rgaDocument.getText();
      
      console.log('Attempting to save document state:', {
        noteID,
        plainText,
        serializedStateSize: JSON.stringify(serializedState).length,
        charactersCount: rgaDocument.characters.size,
        marksCount: rgaDocument.marks.size
      });
      
      // Avoid saving if state hasn't changed
      if (lastSavedState.current === currentStateHash) {
        console.log('Skipping save - state unchanged');
        setSaveStatus('saved');
        return;
      }
      
      const noteRef = doc(firestore, 'notes', noteID);
      
      // Use setDoc with merge to ensure document exists
      await setDoc(noteRef, {
        crdtState: serializedState,
        note: plainText, // Keep for backwards compatibility
        lastModified: Date.now(),
        lastModifiedBy: user?.email || 'anonymous',
        title: noteTitle || 'Untitled Note'
      }, { merge: true });
      
      lastSavedState.current = currentStateHash;
      setSaveStatus('saved');
      console.log('Document state saved to Firestore successfully:', {
        plainText,
        crdtStateSize: JSON.stringify(serializedState).length
      });
      
    } catch (error) {
      console.error('Error saving document state:', error);
      setSaveStatus('unsaved');
    }
  }, [noteID, user?.email, noteTitle]);

  // Debounced auto-save function
  const debouncedSave = useCallback((rgaDocument) => {
    setSaveStatus('unsaved');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveDocumentState(rgaDocument);
    }, 2000); // Save after 2 seconds of inactivity
  }, [saveDocumentState]);

  // Load document state from Firestore and setup real-time sync
  useEffect(() => {
    if (!rgaDoc || !noteID) return;
    
    // Reset loading flag when component mounts or document changes
    hasLoadedInitialState.current = false;
    
    const noteRef = doc(firestore, 'notes', noteID);
    
    const unsubscribe = onSnapshot(noteRef, async (docSnapshot) => {
      console.log('Firestore snapshot received:', {
        exists: docSnapshot.exists(),
        hasLoadedInitialState: hasLoadedInitialState.current,
        noteID
      });
      
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        console.log('Firestore document data:', {
          title: data.title,
          hasCrdtState: !!data.crdtState,
          hasNote: !!data.note,
          plainTextLength: data.note?.length || 0,
          lastModified: data.lastModified
        });
        
        // Load initial CRDT state only once
        if (!hasLoadedInitialState.current && data.crdtState) {
          console.log('Loading persisted CRDT state...');
          try {
            // Deserialize the persisted CRDT state
            const persistedDoc = PeritextDocument.deserialize(data.crdtState, user?.email);
            console.log('Deserialized document:', {
              charactersCount: persistedDoc.characters.size,
              marksCount: persistedDoc.marks.size,
              text: persistedDoc.getText()
            });
            
            // Replace current document with loaded state instead of merging
            rgaDoc.characters = persistedDoc.characters;
            rgaDoc.marks = persistedDoc.marks;
            rgaDoc.root = persistedDoc.root;
            rgaDoc.counter = persistedDoc.counter;
            rgaDoc.markCounter = persistedDoc.markCounter;
            rgaDoc.appliedOperations = persistedDoc.appliedOperations;
            rgaDoc.opSets = persistedDoc.opSets;
            
            console.log('Replaced current document with loaded state:', {
              charactersCount: rgaDoc.characters.size,
              marksCount: rgaDoc.marks.size,
              text: rgaDoc.getText()
            });
            
            // Update editor with loaded content
            const loadedText = rgaDoc.getText();
            if (loadedText && quillRef.current) {
              isApplyingRemoteChange.current = true;
              const editor = quillRef.current.getEditor();
              editor.setText(loadedText, 'silent');
              
              // Apply formatting marks
              const marks = Array.from(rgaDoc.marks.values()).filter(m => !m.deleted);
              console.log(`Applying ${marks.length} formatting marks`);
              marks.forEach(mark => {
                const sequence = rgaDoc.getOrderedSequence();
                const startIdx = sequence.findIndex(n => n.opId === mark.start.opId);
                const endIdx = sequence.findIndex(n => n.opId === mark.end.opId);
                
                if (startIdx >= 0 && endIdx >= 0) {
                  editor.formatText(startIdx, endIdx - startIdx + 1, mark.markType, mark.attributes[mark.markType]);
                  console.log(`Applied ${mark.markType} from ${startIdx} to ${endIdx}`);
                }
              });
              
              lastAppliedText.current = loadedText;
              isApplyingRemoteChange.current = false;
            }
            
            hasLoadedInitialState.current = true;
            console.log(`Successfully loaded CRDT state: "${rgaDoc.getText()}" with ${rgaDoc.marks.size} marks`);
            
          } catch (error) {
            console.error('Error loading CRDT state:', error);
            // Fallback to plain text if CRDT state is corrupted
            if (data.note && !rgaDoc.getText()) {
              console.log('Falling back to plain text loading');
              loadLegacyPlainText(data.note);
            }
          }
        } else if (!hasLoadedInitialState.current && data.note && !rgaDoc.getText()) {
          // Fallback: Load legacy plain text format
          console.log('Loading legacy plain text format:', data.note);
          loadLegacyPlainText(data.note);
          hasLoadedInitialState.current = true;
        } else {
          console.log('Skipping load - already loaded or no content');
        }
      } else {
        console.log('Document not found - will create new document on first edit');
      }
    });
    
    // Helper function to load legacy plain text (for backwards compatibility)
    const loadLegacyPlainText = (plainText) => {
      // Convert plain text to CRDT operations (without triggering WebRTC broadcast)
      let leftOpId = rgaDoc.root.opId;
      for (let i = 0; i < plainText.length; i++) {
        leftOpId = rgaDoc.insert(plainText[i], leftOpId);
      }
      
      if (quillRef.current) {
        isApplyingRemoteChange.current = true;
        quillRef.current.getEditor().setText(plainText, 'silent');
        lastAppliedText.current = plainText;
        isApplyingRemoteChange.current = false;
      }
    };
    
    return () => {
      unsubscribe();
    };
  }, [rgaDoc, noteID, user?.email, quillRef, isApplyingRemoteChange, lastAppliedText]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveStatus,
    debouncedSave,
    saveDocumentState
  };
}