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


export default function NoteApp() {
  const navigate = useNavigate();
  const location = useLocation();

  const { noteID } = useParams();
  const { user } = useAuth();

  const [noteText, setNoteText] = useState("");
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

  // Memoized callbacks to prevent recreating WebRTC manager
  const handleMessage = useCallback((username, message) => {
    try {
      const parsedMessage = JSON.parse(message);
      if (parsedMessage.type === 'text_change' && parsedMessage.author !== user?.email) {
        console.log(parsedMessage.content);
        setNoteText(parsedMessage.content);
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  }, [user?.email]);

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

  useEffect(() => {
    const noteRef = doc(firestore, 'notes', noteID);
    const unsubscribe = onSnapshot(noteRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        if (noteText !== data.note) {
          setNoteText(data.note);
        }
        setNoteTitle(data.title);
      } else {
        console.log('Document not found');
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);


  const handleTextChange = (newNoteText) => {
    console.log(newNoteText);

    // Broadcast text changes to all WebRTC peers
    if (webrtcManager.current && noteText !== newNoteText) {
      webrtcManager.current.broadcastMessage(JSON.stringify({
        type: 'text_change',
        content: newNoteText,
        timestamp: Date.now(),
        author: user?.email
      }));
    }

    // Update local state
    setNoteText(newNoteText);
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
            value={noteText}
            onChange={(newNoteText) => {
              handleTextChange(newNoteText);
            }}
            placeholder="Start writing your note..."
          />
        </div>
      </div>
    </div>
  );
}