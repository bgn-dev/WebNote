import React, { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, deleteDoc, doc, addDoc } from "@firebase/firestore"
import { firestore } from '../database/config';
import { useNavigate } from "react-router-dom";

import './grid.css'
import { MdOutlineDeleteForever } from 'react-icons/md';
import { LuFilePlus } from 'react-icons/lu';
import { BsFillFileEarmarkArrowUpFill } from 'react-icons/bs';
import { PiSignOutBold } from 'react-icons/pi';


import { MdOutlineUploadFile } from 'react-icons/md';


export default function Grid() {
    const navigate = useNavigate();

    const [notes, setNotes] = useState([]); // Use state to manage the notes array
    const [noteTitle, setNoteTitle] = useState("");
    const [toggle, setToggle] = useState(true);

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

    function handleNewNote() {
        setToggle(!setToggle)
    }

    function handleInputChange(e) {
        setNoteTitle(e.target.value);
    }

    const handleNewUpload = async (e) => {
        const fetchD = async () => {
            const docRef = await addDoc(colRef, {
                user: currentUser,
                title: noteTitle,
                note: "",
            });
            console.log("Document written with ID: ", docRef.id);
            handleNote(docRef.id, noteTitle);
        }
        const result = fetchD().catch(console.error);


        //  log the result
        console.log(result);
    }

    function handleSignOut() {
        localStorage.removeItem("currentUser");
        navigate("/");
    }

    return (
        <div className="grid_container">
            <h1 className="grid_title">Your Notes</h1>
            <i className="sign_out" onClick={() => handleSignOut()}> <PiSignOutBold /> </i>
            <div className="new_note_container">
                {toggle &&
                    <button img = {<LuFilePlus/> } onClick={() => handleNewNote()}>
                        <i> <LuFilePlus /> </i>
                    </button>
                }
            </div>
            {!toggle &&
                <div className="new_title_container">
                    <input type="token" value={noteTitle} placeholder="Title for your new note" onChange={(e) => handleInputChange(e)} />
                    <i onClick={() => handleNewUpload()}> <MdOutlineUploadFile /> </i>
                </div>
            }
            <div className="notes">
                {notes.map((note) => (
                    <div className="notes_column" key={note.id}>
                        <div
                            className="note"
                            data-tooltip={note.title}
                            onClick={() => {
                                handleNote(note.id, note.title);
                            }}>
                            <p>{note.title}</p>
                        </div>
                        <i onClick={() => handleDelete(note.id)}> <MdOutlineDeleteForever /> </i>
                    </div>
                ))}
            </div>
        </div>
    );
}

