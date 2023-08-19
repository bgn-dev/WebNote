import React, { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, query, where, deleteDoc, doc, addDoc } from "@firebase/firestore"
import { firestore } from '../database/config';
import { useNavigate } from "react-router-dom";

import './grid.css'
import { MdOutlineDeleteForever } from 'react-icons/md';
import { LuFilePlus } from 'react-icons/lu';
import { PiSignOutBold } from 'react-icons/pi';


import { MdOutlineUploadFile } from 'react-icons/md';


export default function Grid() {
    const navigate = useNavigate();

    const [notes, setNotes] = useState([]); // Use state to manage the notes array
    const [noteTitle, setNoteTitle] = useState("");
    const [toggle, setToggle] = useState(true);

    const currentUser = localStorage.getItem("currentUser");
    const colRef = collection(firestore, "notes"); // reference to the db

    const docQuery = query(colRef, where("user", "==", currentUser)); // Query only the docs uploaded by the currentUser


    const ref = useRef(null); // reference for the div note

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
        setToggle(!toggle);
        console.log(toggle);
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

    function changePaddingNotes() {
        document.documentElement.style.setProperty('--active_title', "6rem"); // changes the padding value from var inside grid.css
    }


    /**
     * Update the variable "--div_size_of_notes_column" inside of grid.css
     * Subtract 53 to fit the delete icon inside the div
     */
    const updateColumnSize = () => {
        if (ref.current) {
            const width = ref.current.offsetWidth;
            //console.log({ width, height });
            document.documentElement.style.setProperty('--div_size_of_notes_column', (ref.current.offsetWidth) - 53 + "px");
        }
    };

    updateColumnSize(); // run once at first render

    /**
     * Track the size of the div "notes_colum"
     * Fires only when size of browser is changed
     */
    useEffect(() => {
        updateColumnSize(); // Initial size update

        window.addEventListener('resize', updateColumnSize);

        return () => {
            window.removeEventListener('resize', updateColumnSize);
        };
    }, []);

    return (
        <div className="grid_container">
            <h1 className="grid_title">Welcome</h1>
            <i className="sign_out" onClick={() => handleSignOut()}> <PiSignOutBold /> </i>
            <div className="new_note_container">
                {toggle &&
                    <button img={<LuFilePlus />} onClick={() => {
                        handleNewNote();
                        changePaddingNotes();
                    }}>
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
                    <div ref={ref} className="notes_column" key={note.id}>
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

