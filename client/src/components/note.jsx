import React, { useState, useEffect } from 'react';
import ReactQuill from 'react-quill';
import { useLocation } from 'react-router-dom';
import { updateDoc, getDoc, doc } from "@firebase/firestore"
import { firestore } from '../database/config';
import { useNavigate } from "react-router-dom";

import './note.css';
import './quill.snow.css';

function NoteApp() {
  const navigate = useNavigate();

  const [noteText, setNoteText] = useState("");

  const location = useLocation();
  const noteID = location.state && location.state.noteID;
  const [noteTitle, setNoteTitle] = useState(location.state && location.state.noteTitle);

  var toolbarOptions = [
    ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
    ['blockquote', 'code-block'],

    [{ 'header': 1 }, { 'header': 2 }],               // custom button values
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'script': 'sub' }, { 'script': 'super' }],      // superscript/subscript
    [{ 'indent': '-1' }, { 'indent': '+1' }],          // outdent/indent
    [{ 'direction': 'rtl' }],                         // text direction

    [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

    [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
    [{ 'font': [] }],
    [{ 'align': [] }],

    ['clean'],                                          // remove formatting button
  ];

  const module = {
    toolbar: toolbarOptions,
  };

  useEffect(() => {
    // Reference to the Firestore document by its ID
    const noteRef = doc(firestore, 'notes', noteID);
    // Fetch the document data
    getDoc(noteRef)
      .then((doc) => {
        if (doc.exists()) {
          setNoteText(doc.data().note);
        } else {
          console.log('Document not found');
        }
      })
      .catch((error) => {
        console.error('Error fetching document:', error);
      });
  }, [noteID]);

  const handleUpload = async () => {
    const noteRef = doc(firestore, 'notes', noteID);
    try {
      await updateDoc(noteRef, {
        note: noteText, // Update the 'note' field with the edited text
        title: noteTitle // Update the 'title' field with the edited title
      });
      console.log("Document successfully updated!");
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  const handleGoBack = () => {
    navigate("/grid");
  }

  return (
    <div className="main_container">
      <div className="nav_container">
        <input className="input_title" type="token" value={noteTitle} placeholder="YOUR TOKEN" onChange={(e) => setNoteTitle(e.target.value)} />
        <button className="save_button" onClick={handleUpload} >Save</button>
        <button className="back_button" onClick={handleGoBack} >Go Back</button>
      </div>
      <ReactQuill modules={module} theme="snow" value={noteText} onChange={setNoteText} />
    </div>

  );
}

export default NoteApp;
