import { useState } from 'react'
import './navbar.css'

import { useNavigate } from "react-router-dom";

import { PiSignOutBold } from 'react-icons/pi';
import { BiSearchAlt2 } from 'react-icons/bi';
import { BiGroup } from 'react-icons/bi';
import { MdOutlineToken } from 'react-icons/md';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';



export default function Navbar({ collabToggle, setCollabToggle }) {
    const navigate = useNavigate();
    const [clickedOnce, setClickedOnce] = useState(false);

    function handleSignOut() {
        localStorage.removeItem("currentUser");
        navigate("/");
    }

    function collabsToggle() {
        setCollabToggle(!collabToggle);
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
                <button className={`toggle-collab ${clickedOnce ? 'button-clicked' : ''}`} onClick={() => collabsToggle()}> <BiGroup /> </button>
                <button className="token-btn" onClick={() => {toast("hello")}}> <MdOutlineToken /> </button>
                <button className="sign-out" onClick={() => handleSignOut()}> <PiSignOutBold /> </button>
            </div>
        </div>
    )
}
