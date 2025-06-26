import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { toast } from 'react-toastify';

import { firestore } from '../firebase/config';
import { updateDoc, getDoc, doc, onSnapshot, arrayUnion } from "@firebase/firestore"

import { debounce } from 'lodash';
import Axios from 'axios';

import ReactQuill from 'react-quill';

import { BiGroup } from 'react-icons/bi';
import { BsPersonPlus } from 'react-icons/bs';
import { TfiBackLeft } from 'react-icons/tfi';
import { MdOutlineClose } from 'react-icons/md';

import 'react-quill/dist/quill.snow.css';
import './quill-custom.css';

export default function NoteApp() {
  const navigate = useNavigate();

  const [noteText, setNoteText] = useState("");
  const [inputToken, setInputToken] = useState("");
  const [showInvitePopup, setShowInvitePopup] = useState(false);

  let plaintext = "";
  const [counter, setCounter] = useState(0);
  const [pressedKey, setPressedKey] = useState(null);

  const location = useLocation();
  const noteID = location.state && location.state.noteID;
  const [noteTitle, setNoteTitle] = useState(location.state && location.state.noteTitle);

  const invite_succes_toast = () => toast.success("User invited.", {
    autoClose: 500,
    newestOnTop: true,
    closeOnClick: true,
    pauseOnHover: false,
    draggable: false,
    progress: undefined,
  });

  const invite_valid_email_toast = () => toast.info("Enter a valid e-mail.", {
    autoClose: 500,
    newestOnTop: true,
    closeOnClick: true,
    pauseOnHover: false,
    draggable: false,
    progress: undefined,
  });

  var toolbarOptions = [
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ 'header': 1 }, { 'header': 2 }],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'script': 'sub' }, { 'script': 'super' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],
    [{ 'size': ['small', false, 'large', 'huge'] }],
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'font': [] }],
    [{ 'align': [] }],
    ['clean'],
  ];

  const module = {
    toolbar: toolbarOptions,
  };

  const handleGoBack = () => {
    navigate("/grid");
  }

  const handleInvite = async (email) => {
    if (email === "") {
      return invite_valid_email_toast();
    }
    console.log(email);

    const noteRef = doc(firestore, 'notes', noteID);
    let documentData = [];

    try {
      const documentSnapshot = await getDoc(noteRef);
      if (documentSnapshot.exists()) {
        await updateDoc(noteRef, {
          collaborators: arrayUnion(email)
        });

        console.log('Updated document:', documentData);
        setInputToken("");
        invite_succes_toast();
      } else {
        console.log('Document does not exist');
      }
    } catch (error) {
      console.error('Error fetching document:', error);
    }
  };

  useEffect(() => {
    const noteRef = doc(firestore, 'notes', noteID);
    const unsubscribe = onSnapshot(noteRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        if (noteText !== data.note) {
          setNoteText(data.note);
        }
        setNoteTitle(data.title);
      } else {
        console.log('Document not found');
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const debouncedHandleUpload = debounce(async (newNoteText, newNoteTitle) => {
    const noteRef = doc(firestore, 'notes', noteID);
    try {
      await updateDoc(noteRef, {
        note: newNoteText,
        title: newNoteTitle,
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  }, 20);

  const handleTextChange = (newNoteText) => {
    if (noteText !== newNoteText) {
      debouncedHandleUpload(newNoteText, noteTitle);
    }
  };

  const handleTitleChange = async (newNoteTitle) => {
    const noteRef = doc(firestore, 'notes', noteID);
    try {
      await updateDoc(noteRef, {
        title: newNoteTitle,
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  useEffect(() => {
    getPlainText();
    handlePlainText();
  }, []);

  function getPlainText() {
    var divElement = document.querySelector(".ql-editor");
    if (divElement) {
      var plainText = divElement.innerText;
      plaintext = plainText;
    } else {
      console.log("Element not found.");
    }
  }

  const quillRef = useRef(null);

  const handlePlainText = () => {
    getPlainText();
    console.log({ Plaintext: plaintext, Length: plaintext.length, opID: counter + "@" + localStorage.getItem("currentUser"), character: pressedKey });
    Axios.post("http://localhost:5000/sync", {
      plaintext: plaintext,
      length: plaintext.length,
      counter: counter,
      opID: counter + "@" + localStorage.getItem("currentUser"),
      character: pressedKey
    })
      .then((response) => {
        console.log(response.data);
      });
  }

  useEffect(() => {
    const handleKeyPress = (event) => {
      console.log('Key pressed:', event.key);
      setPressedKey(event.key)
      setCounter((counter) => counter + 1);
    };
    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  useEffect(() => {
    if (quillRef.current) {
      quillRef.current.getEditor().on('selection-change', (range) => {
        if (range) {
          const cursorPosition = range.index;
          console.log('Cursor position:', cursorPosition);
        }
      });
    }
  }, []);

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

            {/* Collaboration Button */}
            <button
              onClick={() => setShowInvitePopup(true)}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-300"
            >
              <BiGroup className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collaboration Bar */}
        {showInvitePopup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" style={{ margin: 0 }}>
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 w-full max-w-md mx-auto my-auto">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-light text-slate-900">Invite Collaborator</h3>
                  <button
                    onClick={() => setShowInvitePopup(false)}
                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all duration-300"
                  >
                    <MdOutlineClose className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-light text-slate-600 mb-2">
                      Collaborator Email
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
                          setShowInvitePopup(false);
                        }
                      }}
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center space-x-3 pt-2">
                    <button
                      onClick={() => setShowInvitePopup(false)}
                      className="flex-1 px-4 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-300 font-light"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        handleInvite(inputToken);
                        setShowInvitePopup(false);
                      }}
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
        )}
      </div>

      {/* Editor Container */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 quill-container">
          <ReactQuill
            ref={quillRef}
            modules={module}
            theme="snow"
            value={noteText}
            onChange={(newNoteText) => {
              handleTextChange(newNoteText);
              handlePlainText();
            }}
            placeholder="Start writing your note..."
          />
        </div>
      </div>
    </div>
  );
}