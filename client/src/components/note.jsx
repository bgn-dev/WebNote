import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { updateDoc, getDoc, doc, onSnapshot } from "@firebase/firestore"
import { firestore } from '../database/config';
import { useNavigate } from "react-router-dom";
import { debounce } from 'lodash'; // Import the debounce function

import ReactQuill from 'react-quill';

import './note.css';
import './quill.snow.css';

import { BiGroup } from 'react-icons/bi';
import { BsPersonPlus } from 'react-icons/bs';
import { TfiBackLeft } from 'react-icons/tfi';



export default function NoteApp() {
  const navigate = useNavigate();

  const [noteText, setNoteText] = useState("");
  const [inputToken, setInputToken] = useState("");

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

  const handleGoBack = () => {
    navigate("/grid");
  }

  const handleInvite = async (token) => {
    setInputToken(""); // clear variable

    const collabRef = doc(firestore, 'collaboration', noteID);

    let documentData = [];
    let numberOfMembers = 1;

    try {
      // Fetch the document data
      const documentSnapshot = await getDoc(collabRef);

      if (documentSnapshot.exists()) {
        documentData = documentSnapshot.data();
        numberOfMembers = numberOfMembers + Object.keys(documentData).length;
        documentData[numberOfMembers] = token;

        console.log(documentData)
        console.log(numberOfMembers)

        // Create a new document with the modified data
        await updateDoc(collabRef, documentData);

        console.log('Fetched document:', documentData);
      } else {
        console.log('Document does not exist');
      }
    } catch (error) {
      console.error('Error fetching document:', error);
    }
  };


  useEffect(() => {
    const noteRef = doc(firestore, 'notes', noteID);
    // Set up a real-time listener for the document
    const unsubscribe = onSnapshot(noteRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setNoteText(data.note);
        setNoteTitle(data.title);
      } else {
        console.log('Document not found');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [noteID]);

  const debouncedHandleUpload = debounce(async (newNoteText, newNoteTitle) => {
    const noteRef = doc(firestore, 'notes', noteID);
    try {
      await updateDoc(noteRef, {
        note: newNoteText,
        title: newNoteTitle,
      });
      console.log("Document successfully updated!");
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  }, 10);

  const handleTextChange = () => {
    // extracting the innerHTML is needed, since firestore has problems with saving spaces within the value={noteText}
    const quillEditor = document.querySelector('.ql-editor');
    const htmlContent = quillEditor.innerHTML;
    //console.log(htmlContent)
    debouncedHandleUpload(htmlContent, noteTitle);
  };


  return (
    <div className="main_container">
      <div className="group-container">
        <i onClick={() => handleGoBack}> <BiGroup /> </i>
        <input className="input_token" placeholder="TOKEN OF COLLABORATOR" value={inputToken} onChange={(e) => setInputToken(e.target.value)} />
        <button className="invite_btn" onClick={() => handleInvite(inputToken)}> <BsPersonPlus /> </button>
      </div>
      <div className="group-container">
        <input className="input_title" type="token" value={noteTitle} placeholder="Title" onChange={(e) => setNoteTitle(e.target.value)} />
        <button className="back_button" onClick={handleGoBack}> <TfiBackLeft /> </button>
      </div>
      <ReactQuill
        modules={module}
        theme="snow"
        value={noteText}
        onChange={handleTextChange}
      />
    </div>
  );
}


