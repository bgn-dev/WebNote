import { useState, useEffect } from 'react';
import { BsPersonPlus } from 'react-icons/bs';
import { MdOutlineClose } from 'react-icons/md';

import { showToast } from '../common/toast';
import { isValidEmail } from '../../utils/validation';
import { firestore } from '../../firebase/config';
import { updateDoc, getDoc, doc, arrayUnion } from "@firebase/firestore";

/**
 * CollaboratorInviteDialog - Modal for managing document collaborators
 * Allows inviting new collaborators and removing existing ones
 */
export default function CollaboratorInviteDialog({ 
  showInvitePopup, 
  onClose, 
  noteID, 
  user 
}) {
  const [inputToken, setInputToken] = useState("");
  const [existingCollaborators, setExistingCollaborators] = useState([]);
  const [documentOwner, setDocumentOwner] = useState(null);

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

  // Fetch collaborators when dialog opens
  useEffect(() => {
    if (showInvitePopup) {
      fetchCollaborators();
    }
  }, [showInvitePopup, noteID]);

  if (!showInvitePopup) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/50">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-light text-slate-900">Invite Collaborator</h3>
            <button
              onClick={onClose}
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
                onClick={onClose}
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
  );
}