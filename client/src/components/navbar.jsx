import React, { useState } from 'react'


import { useNavigate } from "react-router-dom";

import { PiSignOutBold } from 'react-icons/pi';
import { BiSearchAlt2 } from 'react-icons/bi';
import { BiGroup } from 'react-icons/bi';
import { MdOutlineToken } from 'react-icons/md';

import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './navbar.css'


export default function Navbar({ collabToggle, setCollabToggle }) {
    const navigate = useNavigate();
    const [clickedOnce, setClickedOnce] = useState(false);


    const token_toast = () => toast(localStorage.getItem("currentUser"), {
        icon: <MdOutlineToken />,
    });

    const group_toast = (text) => toast(text, {
        icon: <BiGroup />,
        autoClose: 500,
        newestOnTop: true,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: false,
        progress: undefined,
    });

    function grop_toast_string() {
        if (collabToggle) {
            group_toast("Collaborative mode off");
        } else {
            group_toast("Collaborative mode on");
        }
    }

    function handleSignOut() {
        localStorage.removeItem("currentUser");
        navigate("/");
    }

    function collabsToggle() {
        setCollabToggle(!collabToggle);
        console.log(!collabToggle)
        localStorage.setItem("collabToggle", collabToggle);
        setClickedOnce(!clickedOnce);
    }


    return (
        <div className="navbar-container">
            <div className="navbar">
                <div className="navbar-logo-container">
                    <h1 className="navbar-logo">WebNote
                        <p>Neat-Easy-Collaborative</p>
                    </h1>
                </div>
                <input type="token" placeholder="Search" />
                <button className="search"> <BiSearchAlt2 /> </button>
                <button className={`toggle-collab ${clickedOnce ? 'button-clicked' : ''}`} onClick={() => { collabsToggle(); grop_toast_string() }}> <BiGroup /> </button>
                <button className="token-btn" onClick={token_toast}> <MdOutlineToken /> </button>
                <button className="sign-out" onClick={() => { handleSignOut() }}> <PiSignOutBold /> </button>
            </div>
        </div>
    )
}
