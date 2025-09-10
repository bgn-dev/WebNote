import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { showToast } from './common/toast';
import { isValidEmail } from '../utils/validation';

import { firestore } from '../firebase/config';
import { updateDoc, getDoc, doc, onSnapshot, arrayUnion, setDoc } from "@firebase/firestore"

import socketio from "socket.io-client";

import ReactQuill from 'react-quill';

import { BiGroup } from 'react-icons/bi';
import { BsPersonPlus } from 'react-icons/bs';
import { TfiBackLeft } from 'react-icons/tfi';
import { MdOutlineClose } from 'react-icons/md';

import 'react-quill/dist/quill.snow.css';
import './quill-custom.css';

import WebRTCManager from './webrtc/webrtc-manager';
import { useAuth } from '../firebase/auth';
import PeritextDocument from './crdt/peritext-document';


export default function NoteApp() {
  const navigate = useNavigate();
  const location = useLocation();

  const { noteID } = useParams();
  const { user } = useAuth();

  // CRDT and editor state management (using refs to avoid React state loops)
  const [rgaDoc, setRgaDoc] = useState(null);
  const isApplyingRemoteChange = useRef(false);
  const lastAppliedText = useRef(""); // Track last text applied to prevent loops
  const [inputToken, setInputToken] = useState("");
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [existingCollaborators, setExistingCollaborators] = useState([]);
  const [documentOwner, setDocumentOwner] = useState(null);

  const [noteTitle, setNoteTitle] = useState(location.state && location.state.noteTitle);

  const localUsername = user?.email || 'none';
  const roomName = noteID;

  const [connectedPeers, setConnectedPeers] = useState([]);
  const [webrtcPeers, setWebrtcPeers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  const socketRef = useRef(null);
  const webrtcManager = useRef(null);
  const joinTimeoutRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const lastSavedState = useRef(null);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'unsaved'

  // Initialize RGA document when user is available
  useEffect(() => {
    if (user?.email && !rgaDoc) {
      const doc = new PeritextDocument(user.email);
      setRgaDoc(doc);
      console.log('RGA document initialized for user:', user.email);
    }
  }, [user?.email, rgaDoc]);

  // Initialize editor content when RGA document and Quill are ready
  useEffect(() => {
    if (rgaDoc && quillRef.current) {
      const editor = quillRef.current.getEditor();
      const currentText = rgaDoc.getText();
      
      // Initialize with existing CRDT content without triggering onChange
      if (currentText && currentText !== editor.getText().replace(/\n$/, '')) {
        isApplyingRemoteChange.current = true;
        editor.setText(currentText, 'silent');
        lastAppliedText.current = currentText;
        isApplyingRemoteChange.current = false;
      } else {
        // Initialize tracking with current content
        lastAppliedText.current = editor.getText().replace(/\n$/, '');
      }
      
      console.log('Initialized Quill editor with CRDT content:', `"${lastAppliedText.current}"`);
    }
  }, [rgaDoc]);

  // Generate formatting operations from Quill delta
  const generateFormattingOperations = (delta, rgaDocument) => {
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
  const generateOperationsFromQuillDelta = (delta, rgaDocument) => {
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

  // Memoized callbacks to prevent recreating WebRTC manager
  const handleMessage = useCallback((username, message) => {
    if (!rgaDoc) return;
    
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'crdt_operation') {
        const op = data.operation;
        console.log(`[RECEIVER] ${op.char}(${op.leftId}) from ${op.userId}`);
        
        // Set flag BEFORE any processing
        isApplyingRemoteChange.current = true;
        
        // Apply operation with deduplication
        const wasApplied = rgaDoc.applyOperation(op);
        
        if (wasApplied !== false) { // Only update UI if operation was actually applied
          console.log(`[RECEIVER] Applied: "${rgaDoc.getText()}"`);
          
          // Update Quill with formatted content from CRDT
          if (quillRef.current) {
            const editor = quillRef.current.getEditor();
            const range = editor.getSelection();
            
            // Get formatted content with marks applied
            const formattedContent = rgaDoc.getFormattedContent();
            const newText = rgaDoc.getText();
            
            
            // Apply both text and formatting using Quill delta
            editor.setContents(formattedContent, 'silent');
            
            // Restore cursor position if possible
            if (range) {
              const newLength = newText.length;
              const safeIndex = Math.min(range.index, newLength);
              editor.setSelection(safeIndex, 0, 'silent');
            }
            
            // Update our text tracking
            lastAppliedText.current = newText;
          }
        }
        
        // Clear flag synchronously after ALL updates
        isApplyingRemoteChange.current = false;
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  }, [rgaDoc, user?.email]);

  // Apply remote formatting operation to Quill editor
  const handlePeerConnected = useCallback((peerId, username) => {
    setWebrtcPeers(prev => [...prev, { sid: peerId, username, connected: true }]);
  }, []);

  const handlePeerDisconnected = useCallback((peerId) => {
    setWebrtcPeers(prev => prev.filter(peer => peer.sid !== peerId));
  }, []);

  const joinRoom = useCallback(() => {
    if (socketRef.current && localUsername && roomName) {
      socketRef.current.emit("join", {
        username: localUsername,
        room: roomName
      });
    }
  }, [localUsername, roomName]);

  useEffect(() => {
    socketRef.current = socketio("http://127.0.0.1:9000", {
      transports: ['polling']
    });

    // Handle page refresh/close - cleanup WebRTC connections
    const handleBeforeUnload = (event) => {
      console.log('Page unloading, cleaning up WebRTC connections');
      if (webrtcManager.current) {
        webrtcManager.current.cleanup();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };

    // Handle visibility change (tab switching, minimizing)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('Page hidden, keeping connections alive');
        // Don't cleanup connections on hide - just log
      } else {
        console.log('Page visible again');
        // When page becomes visible, check connection health
        if (webrtcManager.current) {
          console.log(`Checking connections: ${webrtcManager.current.peers.size} active`);
        }
      }
    };

    // Add event listeners for cleanup
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    socketRef.current.on("connect", () => {
      console.log("Socket connected");
      setConnectionStatus("connected");

      webrtcManager.current = WebRTCManager.createInstance(
        socketRef.current,
        handleMessage,
        handlePeerConnected,
        handlePeerDisconnected
      );

      joinRoom();
    });

    socketRef.current.on("ready", (data) => {
      console.log("Room joined, existing peers:", data.peers);
      setConnectedPeers(data.peers);

      if (webrtcManager.current) {
        webrtcManager.current.setUserInfo(localUsername, roomName);

        // Connect to existing peers immediately - deterministic logic prevents conflicts
        data.peers.forEach((peer) => {
          if (webrtcManager.current && !webrtcManager.current.hasPeer(peer.sid)) {
            webrtcManager.current.addPeer(peer.sid, peer.username);
          }
        });
      }
    });

    socketRef.current.on("new_peer", (data) => {
      console.log("New peer joined:", data);
      setConnectedPeers(prev => [...prev, { sid: data.sid, username: data.username }]);
      if (webrtcManager.current) {
        webrtcManager.current.addPeer(data.sid, data.username);
      }
    });

    socketRef.current.on("peer_left", (data) => {
      console.log("Peer left:", data);
      setConnectedPeers(prev => prev.filter(peer => peer.sid !== data.sid));
      if (webrtcManager.current) {
        webrtcManager.current.removePeer(data.sid);
      }
    });

    socketRef.current.on("error", (data) => {
      console.error("Signaling server error:", data.message);
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("Connection error:", error);
      setConnectionStatus("error");
    });

    socketRef.current.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setConnectionStatus("disconnected");
      // Don't cleanup WebRTC connections on disconnect - they can survive reconnection
    });

    return () => {
      console.log('CallScreen component unmounting, cleaning up');

      // Clear timeouts
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Cleanup WebRTC manager
      if (webrtcManager.current) {
        webrtcManager.current.cleanup();
        webrtcManager.current = null;
      }

      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      // Remove event listeners
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [joinRoom, handleMessage, handlePeerConnected, handlePeerDisconnected]);

  var toolbarOptions = [
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ 'header': 1 }, { 'header': 2 }],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'script': 'sub' }, { 'script': 'super' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],
    [{ 'size': ['small', false, 'large', 'huge'] }],
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'font': [] }],
    [{ 'align': [] }],
    ['clean'],
  ];

  const module = {
    toolbar: toolbarOptions,
  };

  const handleGoBack = () => {
    navigate("/notes");
  }

  const fetchCollaborators = async () => {
    if (!noteID) return;
    
    const noteRef = doc(firestore, 'notes', noteID);
    try {
      const documentSnapshot = await getDoc(noteRef);
      if (documentSnapshot.exists()) {
        const data = documentSnapshot.data();
        const collaborators = data.collaborators || [];
        const owner = data.owner || data.createdBy || data.lastModifiedBy; // Check actual owner field first
        
        setDocumentOwner(owner || null); // Explicitly handle undefined case
        setExistingCollaborators(collaborators);
      }
    } catch (error) {
      console.error('Error fetching collaborators:', error);
    }
  };

  const handleInvite = async (email) => {
    if (!email || !isValidEmail(email)) {
      return showToast.error("Please enter a valid email address");
    }
    
    // Check if user is already a collaborator
    if (existingCollaborators.includes(email)) {
      return showToast.error("User is already a collaborator");
    }
    
    if (email === user?.email) {
      return showToast.error("You can't invite yourself");
    }

    const noteRef = doc(firestore, 'notes', noteID);

    try {
      const documentSnapshot = await getDoc(noteRef);
      if (documentSnapshot.exists()) {
        await updateDoc(noteRef, {
          collaborators: arrayUnion(email)
        });

        setInputToken("");
        setExistingCollaborators(prev => [...prev, email]);
        showToast.success("User invited successfully");
      } else {
        console.log('Document does not exist');
      }
    } catch (error) {
      console.error('Error fetching document:', error);
    }
  };

  const removeCollaborator = async (email) => {
    // Prevent removing the document owner
    if (email === documentOwner) {
      return showToast.error("Cannot remove the document owner");
    }
    
    // Only allow owner or the user themselves to remove collaborators
    if (documentOwner !== user?.email && email !== user?.email) {
      return showToast.error("Only the owner can remove other collaborators");
    }

    const noteRef = doc(firestore, 'notes', noteID);
    
    try {
      const documentSnapshot = await getDoc(noteRef);
      if (documentSnapshot.exists()) {
        const data = documentSnapshot.data();
        const updatedCollaborators = (data.collaborators || []).filter(collab => collab !== email);
        
        await updateDoc(noteRef, {
          collaborators: updatedCollaborators
        });

        setExistingCollaborators(updatedCollaborators);
        showToast.success(email === user?.email ? "You left the document" : "Collaborator removed");
      }
    } catch (error) {
      console.error('Error removing collaborator:', error);
      showToast.error("Failed to remove collaborator");
    }
  };

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

  // Track if we've loaded initial state for this session
  const hasLoadedInitialState = useRef(false);

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
        
        setNoteTitle(data.title);
        
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
  }, [rgaDoc, noteID, user?.email]);


  // Handle text content changes (ReactQuill onChange) - React optimized version
  const handleTextChange = useCallback((htmlContent, delta, source, editor) => {
    // Skip if applying remote changes or no RGA document
    if (!rgaDoc || isApplyingRemoteChange.current) {
      return;
    }
    
    // Only process user changes, ignore API/programmatic changes
    if (source !== 'user') {
      return;
    }
    
    // Get current text from editor
    const currentText = editor.getText().replace(/\n$/, ''); // Remove trailing newline
    
    // Process text changes
    if (currentText !== lastAppliedText.current) {
      console.log(`\n[SENDER] "${lastAppliedText.current}" -> "${currentText}"`);
      
      // Generate text operations from Quill delta instead of text diff
      const textOperations = generateOperationsFromQuillDelta(delta, rgaDoc);
      
      // Update tracking
      lastAppliedText.current = currentText;
      
      console.log(`[SENDER] Broadcasting: ${textOperations.map(op => `${op.char}(${op.leftId})`).join(' ')}`);
      console.log(`[SENDER] CRDT final: "${rgaDoc.getText()}"`);
      
      // Operations already applied during generation, just broadcast
      textOperations.forEach(op => {
        // Mark as applied to prevent double application from remote updates
        const operationId = rgaDoc.createOperationId(op);
        rgaDoc.appliedOperations.add(operationId);
        
        // Broadcast to peers (already applied locally during generation)  
        if (webrtcManager.current) {
          webrtcManager.current.broadcastMessage(JSON.stringify({
            type: 'crdt_operation',
            operation: op
          }));
        }
      });
      
      // Trigger auto-save after text changes
      console.log('About to save CRDT state after text changes:', {
        rgaDocExists: !!rgaDoc,
        charactersSize: rgaDoc?.characters.size,
        text: rgaDoc?.getText()
      });
      debouncedSave(rgaDoc);
    }
    
    // Process formatting changes from delta
    if (delta && delta.ops) {
      const formatOperations = generateFormattingOperations(delta, rgaDoc);
      
      formatOperations.forEach(op => {
        rgaDoc.applyOperation(op);
        
        // Broadcast formatting operations
        if (webrtcManager.current) {
          webrtcManager.current.broadcastMessage(JSON.stringify({
            type: 'crdt_operation',
            operation: op
          }));
        }
      });
      
      // Trigger auto-save after formatting changes
      if (formatOperations.length > 0) {
        debouncedSave(rgaDoc);
      }
    }
    
  }, [rgaDoc, user?.email]);

  const handleTitleChange = async (newNoteTitle) => {
    const noteRef = doc(firestore, 'notes', noteID);
    try {
      await updateDoc(noteRef, {
        title: newNoteTitle,
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  const quillRef = useRef(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 font-['Inter',system-ui,sans-serif]">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-xl border-b border-slate-200/50 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Back Button & Title */}
            <div className="flex items-center space-x-4 flex-1">
              <button
                onClick={handleGoBack}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-300"
              >
                <TfiBackLeft className="w-5 h-5" />
              </button>

              <input
                type="text"
                value={noteTitle || ""}
                placeholder="Untitled Note"
                onChange={(e) => handleTitleChange(e.target.value)}
                className="text-lg font-light text-slate-900 bg-transparent border-none outline-none placeholder-slate-400 flex-1 max-w-md tracking-tight"
              />
            </div>

            {/* Live Collaboration Indicator - Notion Style */}
            <div className="flex items-center space-x-2">
              {connectedPeers.length > 0 ? (
                <div 
                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-blue-50/80 backdrop-blur-sm border border-blue-200/60 rounded-lg transition-all duration-300 hover:bg-blue-100/80"
                  title={`${connectedPeers.length + 1} people in this note\n${connectedPeers.map(p => `• ${p.username}${webrtcPeers.find(wp => wp.sid === p.sid) ? ' ✓' : ' (connecting...)'}`).join('\n')}`}
                >
                  <div className="flex -space-x-0.5">
                    {connectedPeers.slice(0, 3).map((peer) => (
                      <div
                        key={peer.sid}
                        className={`w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[10px] font-medium text-white transition-all duration-300 ${
                          webrtcPeers.find(wp => wp.sid === peer.sid) 
                            ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20' 
                            : 'bg-gradient-to-br from-amber-400 to-amber-500 shadow-amber-400/20 animate-pulse'
                        }`}
                        title={`${peer.username} ${webrtcPeers.find(wp => wp.sid === peer.sid) ? '(connected)' : '(connecting...)'}`}
                      >
                        {peer.username.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {connectedPeers.length > 3 && (
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 border-2 border-white shadow-sm flex items-center justify-center">
                        <span className="text-[10px] font-medium text-white">+{connectedPeers.length - 3}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-medium text-blue-700">
                    {connectedPeers.length === 1 ? '1 other' : `${connectedPeers.length} others`}
                  </span>
                </div>
              ) : connectionStatus === 'connecting' ? (
                <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50/80 backdrop-blur-sm border border-amber-200/60 rounded-lg">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-medium text-amber-700">Connecting...</span>
                </div>
              ) : connectionStatus === 'error' ? (
                <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-orange-50/80 backdrop-blur-sm border border-orange-200/60 rounded-lg">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <span className="text-xs font-medium text-orange-700">Offline</span>
                </div>
              ) : (
                <span className="text-xs font-light text-slate-400">Working alone</span>
              )}
            </div>

            {/* Collaboration Button */}
            <button
              onClick={() => {
                setShowInvitePopup(true);
                fetchCollaborators();
              }}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-300"
            >
              <BiGroup className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Collaboration Popup - Moved outside header for proper centering */}
      {showInvitePopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 w-full max-w-md">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-light text-slate-900">Invite Collaborator</h3>
                  <button
                    onClick={() => setShowInvitePopup(false)}
                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all duration-300"
                  >
                    <MdOutlineClose className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-6">
                <div className="space-y-4">
                  {/* Current Collaborators */}
                  <div>
                    <label className="block text-sm font-light text-slate-600 mb-3">
                      Current Collaborators
                    </label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {/* Owner */}
                      {documentOwner ? (
                        <div className="flex items-center justify-between p-3 bg-slate-50/80 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-xs font-medium text-white">
                              {documentOwner.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="text-sm font-medium text-slate-900">{documentOwner}</span>
                              <span className="text-xs text-slate-500 ml-2">(Owner)</span>
                              {documentOwner === user?.email && (
                                <span className="text-xs text-blue-600 ml-1">(You)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-3 bg-amber-50/80 rounded-lg border border-amber-200/50">
                          <div className="flex items-center space-x-3">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-xs font-medium text-white">
                              ?
                            </div>
                            <div>
                              <span className="text-sm font-medium text-slate-900">Unknown Owner</span>
                              <span className="text-xs text-slate-500 ml-2">(Legacy document)</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Existing collaborators (excluding owner and current user to prevent duplicates) */}
                      {existingCollaborators
                        .filter(email => email !== documentOwner) // Don't show owner twice
                        .map((email, index) => (
                          <div key={email} className="flex items-center justify-between p-3 bg-slate-50/80 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-xs font-medium text-white">
                                {email.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="text-sm text-slate-900">{email}</span>
                                {email === user?.email && (
                                  <span className="text-xs text-blue-600 ml-2">(You)</span>
                                )}
                              </div>
                            </div>
                            {(documentOwner === user?.email || email === user?.email) && (
                              <button
                                onClick={() => removeCollaborator(email)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded-lg transition-all duration-200"
                                title={email === user?.email ? "Leave document" : "Remove collaborator"}
                              >
                                <MdOutlineClose className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))
                      }

                      {existingCollaborators.filter(email => email !== documentOwner).length === 0 && !documentOwner && (
                        <div className="text-center py-4 text-slate-400">
                          <span className="text-sm">No collaborators yet</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Add new collaborator */}
                  <div className="border-t border-slate-200/50 pt-4">
                    <label className="block text-sm font-light text-slate-600 mb-2">
                      Invite New Collaborator
                    </label>
                    <input
                      type="text"
                      placeholder="example@outlook.com"
                      value={inputToken}
                      onChange={(e) => setInputToken(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all duration-300 font-light"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleInvite(inputToken);
                        }
                      }}
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center space-x-3 pt-2">
                    <button
                      onClick={() => setShowInvitePopup(false)}
                      className="flex-1 px-4 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-300 font-light"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => handleInvite(inputToken)}
                      disabled={!inputToken.trim()}
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-light flex items-center justify-center space-x-2"
                    >
                      <BsPersonPlus className="w-4 h-4" />
                      <span>Invite</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Editor Container */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 quill-container">
          <ReactQuill
            ref={quillRef}
            modules={module}
            theme="snow"
            onChange={handleTextChange}
            placeholder="Start writing your note..."
          />
        </div>
      </div>

      {/* Floating Save Status - Google Docs Style */}
      {saveStatus !== 'saved' && (
        <div className="fixed bottom-6 right-6 z-30">
          <div className={`px-3 py-2 rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 border ${
            saveStatus === 'saving' 
              ? 'bg-amber-100/90 text-amber-700 border-amber-200' 
              : 'bg-red-100/90 text-red-700 border-red-200'
          }`}>
            <span className="text-xs font-medium">
              {saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}