import React, { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from "@firebase/firestore"
import { firestore } from '../database/config';
import { useNavigate } from "react-router-dom";

import './grid.css'

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

    const handleNote = (ID, title) => {
        navigate("/note", { state: { noteID: ID, noteTitle: title } });
    }

    return (
        <div className="notes">
            {notes.map((note) => (
                <div className="notes_container" key={note.id}>
                    <div className="note" onClick={() => {
                        handleNote(note.id, note.title);
                    }}>
                        <p>{note.id}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

