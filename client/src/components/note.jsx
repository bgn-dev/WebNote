import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { showToast } from './common/toast';
import { isValidEmail } from '../utils/validation';

import { firestore } from '../firebase/config';
import { updateDoc, getDoc, doc, onSnapshot, arrayUnion } from "@firebase/firestore"

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
import PeritextDocument from './crdt/rga-document';


export default function NoteApp() {
  const navigate = useNavigate();
  const location = useLocation();

  const { noteID } = useParams();
  const { user } = useAuth();

  // CRDT and editor state management (using refs to avoid React state loops)
  const [rgaDoc, setRgaDoc] = useState(null);
  const isApplyingRemoteChange = useRef(false);
  const lastAppliedText = useRef(""); // Track last text applied to prevent loops
  const operationQueue = useRef([]); // Queue operations during editor updates
  const [inputToken, setInputToken] = useState("");
  const [showInvitePopup, setShowInvitePopup] = useState(false);

  const [noteTitle, setNoteTitle] = useState(location.state && location.state.noteTitle);

  const localUsername = user?.email || 'none';
  const roomName = noteID;

  const [connectedPeers, setConnectedPeers] = useState([]);
  const [webrtcPeers, setWebrtcPeers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  const socketRef = useRef(null);
  const webrtcManager = useRef(null);
  const joinTimeoutRef = useRef(null);

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

  // Helper function to find insertion position in text diff
  const findInsertPosition = (oldText, newText) => {
    let i = 0;
    while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) {
      i++;
    }
    return i;
  };

  // Helper function to find deletion position in text diff
  const findDeletePosition = (oldText, newText) => {
    let i = 0;
    while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) {
      i++;
    }
    return i;
  };

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

  // Proper text diff algorithm (simplified implementation)
  const computeTextDiff = (oldText, newText) => {
    const changes = [];
    
    // Simple implementation - find single change point
    let i = 0;
    while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) {
      i++;
    }
    
    if (i === oldText.length && i === newText.length) {
      return changes; // No changes
    }
    
    if (newText.length > oldText.length) {
      // Insertion
      const insertedText = newText.slice(i, i + (newText.length - oldText.length));
      changes.push({
        type: 'insert',
        index: i,
        text: insertedText
      });
    } else if (newText.length < oldText.length) {
      // Deletion
      const deletedCount = oldText.length - newText.length;
      changes.push({
        type: 'delete',
        index: i,
        count: deletedCount
      });
    } else {
      // Replacement (delete then insert)
      let j = oldText.length - 1;
      let k = newText.length - 1;
      while (j >= i && k >= i && oldText[j] === newText[k]) {
        j--;
        k--;
      }
      
      if (j >= i) {
        changes.push({
          type: 'delete',
          index: i,
          count: j - i + 1
        });
      }
      
      if (k >= i) {
        changes.push({
          type: 'insert',
          index: i,
          text: newText.slice(i, k + 1)
        });
      }
    }
    
    return changes;
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

      // Clear timeout
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
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

  const handleInvite = async (email) => {
    if (!email || !isValidEmail(email)) {
      return showToast.error("Please enter a valid email address");
    }
    console.log(email);

    const noteRef = doc(firestore, 'notes', noteID);

    try {
      const documentSnapshot = await getDoc(noteRef);
      if (documentSnapshot.exists()) {
        await updateDoc(noteRef, {
          collaborators: arrayUnion(email)
        });

        setInputToken("");
        showToast.success("User invited successfully");
      } else {
        console.log('Document does not exist');
      }
    } catch (error) {
      console.error('Error fetching document:', error);
    }
  };

  // Load initial document content and setup Firestore sync
  useEffect(() => {
    if (!rgaDoc) return;
    
    const noteRef = doc(firestore, 'notes', noteID);
    const unsubscribe = onSnapshot(noteRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        
        // Only initialize RGA document once with existing content
        const currentRGAText = rgaDoc.getText();
        if (!currentRGAText && data.note) {
          console.log('Loading initial document content into CRDT');
          // Insert initial content into RGA document
          for (let i = 0; i < data.note.length; i++) {
            const char = data.note[i];
            // Use cursor positioning for character-by-character insertion
            const leftOpId = rgaDoc.getLeftOpIdForCursor(i);
            rgaDoc.insert(char, leftOpId);
          }
          
          // Update editor with initial content
          if (quillRef.current) {
            isApplyingRemoteChange.current = true;
            quillRef.current.getEditor().setText(data.note, 'silent');
            lastAppliedText.current = data.note;
            isApplyingRemoteChange.current = false;
          }
        }
        
        setNoteTitle(data.title);
      } else {
        console.log('Document not found');
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [rgaDoc]);


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
    }
    
  }, [rgaDoc, user?.email]);

  // Selection change handler - no longer needed for formatting (handled in onChange)
  const handleSelectionChange = (range, source, editor) => {
    // Just track selection for cursor position, formatting is handled in onChange
    console.log('Selection changed:', range, source);
  };

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

            {/* Collaboration Button */}
            <button
              onClick={() => setShowInvitePopup(true)}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-300"
            >
              <BiGroup className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collaboration Bar */}
        {showInvitePopup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" style={{ margin: 0 }}>
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 w-full max-w-md mx-auto my-auto">
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
                  <div>
                    <label className="block text-sm font-light text-slate-600 mb-2">
                      Collaborator Email
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
                          setShowInvitePopup(false);
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
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        handleInvite(inputToken);
                        setShowInvitePopup(false);
                      }}
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
      </div>

      {/* Editor Container */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 quill-container">
          <ReactQuill
            ref={quillRef}
            modules={module}
            theme="snow"
            onChange={handleTextChange}
            onChangeSelection={handleSelectionChange}
            placeholder="Start writing your note..."
          />
        </div>
      </div>
    </div>
  );
}