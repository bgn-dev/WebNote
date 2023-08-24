import React, { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, query, where, deleteDoc, doc, updateDoc, getDocs, getDoc, setDoc, deleteField } from "@firebase/firestore"
import { firestore } from '../database/config';
import { useNavigate } from "react-router-dom";

import './grid.css'

import { MdOutlineDeleteForever } from 'react-icons/md';
import { LuFilePlus } from 'react-icons/lu';
import { MdOutlineUploadFile } from 'react-icons/md';

import Navbar from './navbar';



export default function Grid() {
    const navigate = useNavigate();

    const [notes, setNotes] = useState([]); // Use state to manage the notes array
    const [collabs, setCollabs] = useState([]); // Use state to manage the notes array
    const [collabedDocs, setCollabedDocs] = useState([]);
    const [noteTitle, setNoteTitle] = useState("");
    const [toggle, setToggle] = useState(true);

    const currentUser = localStorage.getItem("currentUser");
    const colRef = collection(firestore, "notes"); // reference to the db
    const docQuery = query(colRef, where("user", "==", currentUser)); // Query only the docs uploaded by the currentUser

    const collabRef = collection(firestore, "collaboration");

    const ref = useRef(null); // reference for the div note

    const [collabToggle, setCollabToggle] = useState(false);

    /**
     * Fetch documents where user collab
     */
    const searchDocumentsForCurrentUser = async () => {
        try {
            const querySnapshot = await getDocs(collabRef);
            const newCollabs = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();

                // Check if currentUser is listed in any field value and check if there is more then one user contrubuting
                Object.values(data).forEach((fieldValue) => {
                    if (fieldValue === currentUser && Object.keys(data).length > 1) {
                        newCollabs.push(doc.id);
                    }
                });
            });

            setCollabs((prevCollabs) => [...prevCollabs, ...newCollabs]);

            const fetchedDocs = [];
            for (const collabId of newCollabs) {
                const docRef = doc(colRef, collabId);
                const docSnapshot = await getDoc(docRef);
                if (docSnapshot.exists()) {
                    fetchedDocs.push({ id: collabId, ...docSnapshot.data() });
                }
            }
            console.log(fetchedDocs)
            setCollabedDocs(fetchedDocs);
        } catch (error) {
            console.error("Error getting documents:", error);
        }
    };


    // Subscribe to changes within the database
    useEffect(() => {
        const unsubscribe = onSnapshot(docQuery, (snapshot) => {
            const updatedNotes = snapshot.docs.map((doc) => ({
                ...doc.data(),
                id: doc.id
            }));
            searchDocumentsForCurrentUser(); // Function called, to run it only once, with the help of unsubscribe
            setNotes(updatedNotes); // Update the state with the new notes
        });
        // Unsubscribe from the snapshot listener on component unmount
        return () => unsubscribe();
    }, []);

    const handleDelete = async (ID) => {
        if (collabToggle === true) {
            const collabRef = doc(firestore, "collaboration", ID); // Replace 'yourCollectionName'
            try {
                await updateDoc(collabRef, {
                    [currentUser]: deleteField()
                });
                console.log('Document deleted successfully.');
            } catch (error) {
                console.error('Error deleting field:', error);
            }
        } else {
            try {
                const noteRef = doc(firestore, 'notes', ID);
                await deleteDoc(noteRef);   // Delete the document
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
        console.log(toggle);
    }

    function handleInputChange(e) {
        setNoteTitle(e.target.value);
    }

    const handleNewUpload = async () => {
        try {
            const docRef1 = doc(colRef);
            await setDoc(docRef1, {
                user: currentUser,
                title: noteTitle,
                note: "",
            });

            // Use the ID of the first document for the second document
            const docRef2 = doc(collabRef, docRef1.id); // Use the same custom ID
            await setDoc(docRef2, {
                [currentUser]: currentUser,
            });
            console.log("Both documents uploaded successfully.", docRef1.id, docRef2.id);
            handleNote(docRef1.id, noteTitle); // Navigate to note.jsx
        } catch (error) {
            console.error("Error uploading documents:", error);
        }
    };

    function changePaddingNotes() {
        document.documentElement.style.setProperty('--active_title', "6rem"); // changes the padding value from var inside grid.css
    }


    /**
     * Update the variable "--div_size_of_notes_column" inside of grid.css
     * Default: Subtract 53 to fit the delete icon inside the div
     */
    const updateColumnSize = () => {
        if (ref.current) {
            const width = ref.current.offsetWidth;
            //console.log({ width, height });
            document.documentElement.style.setProperty('--div_size_of_notes_column', width - 53 + "px");
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
        <div>
            < Navbar
                collabToggle={collabToggle}
                setCollabToggle={setCollabToggle}
            />
            <div className="grid_container">
                <div className="new_note_container">
                    {toggle &&
                        <div>
                            <button onClick={() => {
                                handleNewNote();
                                changePaddingNotes();
                            }}>
                                <i> <LuFilePlus /> </i>
                            </button>
                        </div>
                    }
                </div>
                {!toggle &&
                    <div className="new_title_container">
                        <input type="text" value={noteTitle} placeholder="Title" onChange={(e) => handleInputChange(e)} />
                        <i onClick={() => handleNewUpload()}> <MdOutlineUploadFile /> </i>
                    </div>
                }
                {!collabToggle &&
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
                }
                {collabToggle &&
                    <div className="notes">
                        {collabedDocs.map((note) => (
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
                }
            </div>
        </div>
    );
}

