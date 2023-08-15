import React, { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, deleteDoc, doc } from "@firebase/firestore"
import { firestore } from '../database/config';
import { useNavigate } from "react-router-dom";

import './grid.css'
import { MdOutlineDeleteForever } from 'react-icons/md';
import { MdOutlineNoteAdd } from 'react-icons/md';

export default function Grid() {
    const navigate = useNavigate();

    const [notes, setNotes] = useState([]); // Use state to manage the notes array
    const [noteID, setNoteID] = useState("")

    const currentUser = localStorage.getItem("currentUser");
    const colRef = collection(firestore, "notes");

    // Query only the docs uploaded by the currentUser
    const docQuery = query(colRef, where("user", "==", currentUser));

    // Subscribe to changes within the database
    useEffect(() => {
        const unsubscribe = onSnapshot(docQuery, (snapshot) => {
            const updatedNotes = snapshot.docs.map((doc) => ({
                ...doc.data(),
                id: doc.id
            }));
            setNotes(updatedNotes); // Update the state with the new notes
        });

        // Unsubscribe from the snapshot listener on component unmount
        return () => unsubscribe();
    }, []);

    const handleDelete = async (ID) => {
        try {
            // Create a reference to the document using its ID
            const noteRef = doc(firestore, 'notes', ID);

            // Delete the document
            await deleteDoc(noteRef);

            console.log('Document deleted successfully.');
        } catch (error) {
            console.error('Error deleting document:', error);
        }
    };

    const handleNote = (ID, title) => {
        navigate("/note", { state: { noteID: ID, noteTitle: title } });
    }

    const handleNewNote = () => {

    }

    return (
        <div>
            <h1 className="grid_title">Your Notes</h1>
            <div className="new_note">
                <button onClick={() => handleNewNote()}>
                    <i> <MdOutlineNoteAdd /> </i>
                </button>
            </div>
            <div className="notes">
                {notes.map((note) => (
                    <div className="notes_container" key={note.id}>
                        <div className="note" onClick={() => {
                            handleNote(note.id, note.title);
                        }}>
                            <p>{note.id}</p>
                        </div>
                        <i onClick={() => handleDelete(note.id)}> <MdOutlineDeleteForever /> </i>
                    </div>
                ))}
            </div>
        </div>
    );
}

