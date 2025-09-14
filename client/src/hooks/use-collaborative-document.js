import { useState, useEffect, useRef, useCallback } from 'react';
import socketio from "socket.io-client";

import WebRTCManager from '../components/webrtc/webrtc-manager';
import PeritextDocument from '../components/crdt/peritext-document';
import { 
  generateOperationsFromQuillDelta, 
  generateFormattingOperations, 
  adjustCursorForOperation 
} from '../utils/crdt-operations';

/**
 * Custom hook for managing collaborative document editing
 * Handles CRDT document state, WebRTC connections, and real-time synchronization
 */
export function useCollaborativeDocument(noteID, user) {
  // CRDT and editor state management (using refs to avoid React state loops)
  const [rgaDoc, setRgaDoc] = useState(null);
  const isApplyingRemoteChange = useRef(false);
  const lastAppliedText = useRef(""); // Track last text applied to prevent loops
  const quillRef = useRef(null);
  const onDocumentChangeRef = useRef(null);

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
            
            // Restore cursor position with adjustment for the operation
            if (range) {
              const adjustedRange = adjustCursorForOperation(range, op, rgaDoc);
              const newLength = newText.length;
              const safeIndex = Math.min(adjustedRange.index, newLength);
              const safeLength = Math.min(adjustedRange.length || 0, newLength - safeIndex);
              
              editor.setSelection(safeIndex, safeLength, 'silent');
              
              console.log(`[CURSOR] Adjusted cursor from ${range.index} to ${safeIndex} (op: ${op.action} at ${rgaDoc.getTextIndexForOperation(op)})`);
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
      
      // Trigger callback for auto-save (handled by parent)
      if (textOperations.length > 0 && onDocumentChangeRef.current) {
        onDocumentChangeRef.current(rgaDoc);
      }
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
      
      // Trigger callback for auto-save after formatting changes
      if (formatOperations.length > 0 && onDocumentChangeRef.current) {
        onDocumentChangeRef.current(rgaDoc);
      }
    }
  }, [rgaDoc, user?.email]);

  // WebRTC and Socket connection management
  useEffect(() => {
    console.log('Connecting to:', process.env.REACT_APP_SIGNALING_SERVER_URL);
    socketRef.current = socketio(process.env.REACT_APP_SIGNALING_SERVER_URL, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true
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

  // Function to set the document change callback
  const setOnDocumentChange = useCallback((callback) => {
    onDocumentChangeRef.current = callback;
  }, []);

  return {
    // CRDT document
    rgaDoc,
    
    // Editor refs and handlers
    quillRef,
    handleTextChange,
    isApplyingRemoteChange,
    lastAppliedText,
    
    // Connection state
    connectedPeers,
    webrtcPeers,
    connectionStatus,
    
    // Callback setter
    setOnDocumentChange,
    
    // Internal refs (for advanced usage)
    webrtcManager,
    socketRef
  };
}