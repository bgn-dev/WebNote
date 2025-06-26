import { useEffect, useState } from 'react'
import { useNavigate } from "react-router-dom";

import { firestore } from '../firebase/config';
import { collection, onSnapshot, deleteDoc, doc, updateDoc, getDocs, getDoc, setDoc } from "@firebase/firestore"

import Navbar from './navbar';
import { useAuth } from '../firebase/auth';

import { MdOutlineDeleteForever } from 'react-icons/md';
import { LuFilePlus } from 'react-icons/lu';
import { MdOutlineUploadFile } from 'react-icons/md';

export default function Grid() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [personalNotes, setNotes] = useState([]);
    const [collabedNotes, setCollabedDocs] = useState([]);
    const [noteTitle, setNoteTitle] = useState("");
    const [toggle, setToggle] = useState(true);
    const [collabToggle, setCollabToggle] = useState(false);

    const currentUserEmail = user?.email;
    const colRef = collection(firestore, "notes");

    const fetchUserDocuments = async () => {
        try {
            const querySnapshot = await getDocs(colRef);
            const personalNotes = [];
            const collaborativeNotes = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();

                // Check if current user is involved in this document
                const isOwner = data.owner === currentUserEmail;
                const isCollaborator = data.collaborators && data.collaborators.includes(currentUserEmail);

                if (isOwner || isCollaborator) {
                    const docData = { id: doc.id, ...data };

                    // Determine if it's personal or collaborative based on collaborator count
                    if (data.collaborators && data.collaborators.length > 1) {
                        // Multiple collaborators = collaborative document
                        collaborativeNotes.push(docData);
                    } else {
                        // Single collaborator (should be the owner) = personal document
                        personalNotes.push(docData);
                    }
                }
            });

            setNotes(personalNotes);
            setCollabedDocs(collaborativeNotes);
        } catch (error) {
            console.error("Error getting documents:", error);
        }
    };

    useEffect(() => {
        if (!currentUserEmail) return;

        // Set up real-time listener for all notes
        const unsubscribe = onSnapshot(colRef, (snapshot) => {
            // Re-fetch and categorize documents when any change occurs
            fetchUserDocuments();
        });

        return () => unsubscribe();
    }, [currentUserEmail]);

    const handleDelete = async (ID) => {
        if (collabToggle === true) {
            // For collaborative documents, remove current user from collaborators
            const noteRef = doc(firestore, "notes", ID);
            try {
                // First, get the current document to check collaborators
                const docSnap = await getDoc(noteRef);
                if (docSnap.exists()) {
                    const docData = docSnap.data();
                    const updatedCollaborators = docData.collaborators.filter(email => email !== currentUserEmail);

                    if (updatedCollaborators.length === 0) {
                        // If no collaborators left, delete the entire document
                        await deleteDoc(noteRef);
                        console.log('Document deleted successfully (no collaborators remaining).');
                    } else {
                        // Update the collaborators array
                        await updateDoc(noteRef, {
                            collaborators: updatedCollaborators
                        });
                        console.log('User removed from collaboration successfully.');
                    }
                }
            } catch (error) {
                console.error('Error handling collaborative document:', error);
            }
        } else {
            // For personal documents, delete entirely
            try {
                const noteRef = doc(firestore, 'notes', ID);
                await deleteDoc(noteRef);
                console.log('Document deleted successfully.');
            } catch (error) {
                console.error('Error deleting document:', error);
            }
        }
    };

    const handleNote = (ID, title) => {
        navigate("/note", { state: { noteID: ID, noteTitle: title } });
    }

    function handleNewNote() {
        setToggle(!toggle);
    }

    function handleInputChange(e) {
        setNoteTitle(e.target.value);
    }

    const handleNewUpload = async () => {
        try {
            const docRef1 = doc(colRef);
            await setDoc(docRef1, {
                owner: currentUserEmail,
                title: noteTitle,
                note: "",
                collaborators: [currentUserEmail],
            });

            console.log("Document uploaded successfully.", docRef1.id);
            handleNote(docRef1.id, noteTitle);
        } catch (error) {
            console.error("Error uploading document:", error);
        }
    };

    const currentNotes = collabToggle ? collabedNotes : personalNotes;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 font-['Inter',system-ui,sans-serif]">
            <Navbar
                collabToggle={collabToggle}
                setCollabToggle={setCollabToggle}
            />

            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
                        <div className="text-center md:text-left mb-4 md:mb-0">
                            <h1 className="text-3xl font-light text-slate-900 mb-2 tracking-tight">
                                {collabToggle ? 'Collaborative Notes' : 'My Notes'}
                            </h1>
                            <p className="text-slate-500 font-light">
                                {collabToggle ? 'Notes shared with your team' : 'Your personal collection of ideas'}
                            </p>
                        </div>

                        {/* Create Note Button */}
                        {toggle && (
                            <div className="flex justify-center md:justify-end">
                                <button
                                    onClick={() => {
                                        handleNewNote();
                                    }}
                                    className="inline-flex items-center space-x-2 bg-gradient-to-r from-slate-900 to-slate-700 text-white font-medium px-6 py-3 rounded-2xl hover:from-slate-800 hover:to-slate-600 transform hover:scale-[1.02] hover:shadow-xl transition-all duration-300 relative overflow-hidden group"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                                    <LuFilePlus className="w-5 h-5 relative z-10" />
                                    <span className="relative z-10 font-medium tracking-wide">New Note</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Create Note Input */}
                    {!toggle && (
                        <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/20 mb-8">
                            <div className="flex items-center space-x-4">
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        value={noteTitle}
                                        placeholder="Enter note title..."
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200/50 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white/80 transition-all duration-300 font-light tracking-wide"
                                        autoFocus
                                    />
                                </div>
                                <button
                                    onClick={handleNewUpload}
                                    disabled={!noteTitle.trim()}
                                    className="bg-gradient-to-r from-slate-900 to-slate-700 text-white p-3 rounded-xl hover:from-slate-800 hover:to-slate-600 transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                >
                                    <MdOutlineUploadFile className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setToggle(true)}
                                    className="bg-slate-100 text-slate-600 p-3 rounded-xl hover:bg-slate-200 transition-all duration-300"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Notes Grid */}
                {currentNotes.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {currentNotes.map((note) => (
                            <div
                                key={note.id}
                                className="group relative bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-white/20 hover:shadow-2xl hover:border-slate-200/50 transition-all duration-300 cursor-pointer transform hover:scale-[1.02]"
                            >
                                {/* Note Content */}
                                <div
                                    onClick={() => handleNote(note.id, note.title)}
                                    className="min-h-[120px] flex flex-col"
                                >
                                    <h3 className="text-lg font-medium text-slate-900 mb-3 line-clamp-2 tracking-tight">
                                        {note.title}
                                    </h3>

                                    {/* Note Preview */}
                                    <div className="flex-1 text-sm text-slate-500 font-light leading-relaxed">
                                        {note.note ? (
                                            <p className="line-clamp-3">
                                                {note.note.substring(0, 120)}
                                                {note.note.length > 120 && '...'}
                                            </p>
                                        ) : (
                                            <p className="italic text-slate-400">No content yet</p>
                                        )}
                                    </div>

                                    {/* Collaboration Indicator */}
                                    {collabToggle && (
                                        <div className="mt-3 flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                            <span className="text-xs text-slate-400 font-light">Collaborative</span>
                                        </div>
                                    )}
                                </div>

                                {/* Delete Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(note.id);
                                    }}
                                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 bg-red-50 text-red-500 p-2 rounded-lg hover:bg-red-100 hover:text-red-600 transition-all duration-300 transform hover:scale-110"
                                >
                                    <MdOutlineDeleteForever className="w-4 h-4" />
                                </button>

                                {/* Hover Effect Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-purple-50/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* Empty State */
                    <div className="text-center py-16">
                        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-12 shadow-xl border border-white/20 max-w-md mx-auto">
                            <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <LuFilePlus className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-xl font-light text-slate-900 mb-3">
                                {collabToggle ? 'No collaborative notes yet' : 'No notes yet'}
                            </h3>
                            <p className="text-slate-500 font-light mb-8 leading-relaxed">
                                {collabToggle
                                    ? 'Start collaborating with your team by creating or joining shared notes.'
                                    : 'Create your first note to get started with WebNote.'
                                }
                            </p>
                            {toggle && !collabToggle && (
                                <button
                                    onClick={handleNewNote}
                                    className="inline-flex items-center space-x-2 bg-gradient-to-r from-slate-900 to-slate-700 text-white font-medium px-6 py-3 rounded-2xl hover:from-slate-800 hover:to-slate-600 transform hover:scale-[1.02] hover:shadow-xl transition-all duration-300"
                                >
                                    <LuFilePlus className="w-5 h-5" />
                                    <span className="font-medium tracking-wide">Create Your First Note</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}