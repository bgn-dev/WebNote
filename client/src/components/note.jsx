import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { TfiBackLeft } from 'react-icons/tfi';

import { firestore } from '../firebase/config';
import { updateDoc, doc } from "@firebase/firestore";
import { useAuth } from '../firebase/auth';

// Custom hooks
import { useCollaborativeDocument } from '../hooks/use-collaborative-document';
import { useDocumentPersistence } from '../hooks/use-document-persistence';

// Components
import CollaborationHeader from './note/collaboration-header';
import CollaboratorInviteDialog from './note/collaborator-invite-dialog';
import DocumentEditor from './note/document-editor';
import SaveStatusIndicator from './note/save-status-indicator';


/**
 * NoteApp - Main collaborative document editor component
 * Orchestrates real-time collaboration, document persistence, and UI components
 */
export default function NoteApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { noteID } = useParams();
  const { user } = useAuth();

  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [noteTitle, setNoteTitle] = useState(location.state && location.state.noteTitle);

  // Initialize collaborative document (without auto-save callback for now)
  const collaborative = useCollaborativeDocument(noteID, user);

  // Initialize document persistence
  const persistence = useDocumentPersistence(
    collaborative.rgaDoc,
    noteID,
    user,
    noteTitle,
    collaborative.quillRef,
    collaborative.isApplyingRemoteChange,
    collaborative.lastAppliedText
  );

  // Connect the hooks after both are initialized
  useEffect(() => {
    if (persistence.debouncedSave) {
      collaborative.setOnDocumentChange(persistence.debouncedSave);
    }
  }, [collaborative.setOnDocumentChange, persistence.debouncedSave]);





  const handleGoBack = () => {
    navigate("/notes");
  };

  const handleTitleChange = async (newNoteTitle) => {
    setNoteTitle(newNoteTitle);
    const noteRef = doc(firestore, 'notes', noteID);
    try {
      await updateDoc(noteRef, {
        title: newNoteTitle,
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  const handleShowInvite = () => {
    setShowInvitePopup(true);
  };

  const handleCloseInvite = () => {
    setShowInvitePopup(false);
  };


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

            {/* Live Collaboration Indicator & Controls */}
            <CollaborationHeader
              connectedPeers={collaborative.connectedPeers}
              webrtcPeers={collaborative.webrtcPeers}
              connectionStatus={collaborative.connectionStatus}
              onShowInvite={handleShowInvite}
            />
          </div>
        </div>
      </div>

      {/* Collaboration Popup */}
      <CollaboratorInviteDialog
        showInvitePopup={showInvitePopup}
        onClose={handleCloseInvite}
        noteID={noteID}
        user={user}
      />

      {/* Editor Container */}
      <DocumentEditor
        quillRef={collaborative.quillRef}
        onTextChange={collaborative.handleTextChange}
      />

      {/* Floating Save Status */}
      <SaveStatusIndicator saveStatus={persistence.saveStatus} />
    </div>
  );
}