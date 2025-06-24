import { useState } from 'react'
import { useNavigate } from "react-router-dom";

import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { useAuth } from '../firebase/auth';

import { PiSignOutBold } from 'react-icons/pi';
import { BiSearchAlt2 } from 'react-icons/bi';
import { BiGroup } from 'react-icons/bi';
import { BiMenu } from 'react-icons/bi';
import { MdOutlineToken } from 'react-icons/md';

import './navbar.css'

export default function Navbar({ collabToggle, setCollabToggle }) {
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [clickedOnce, setClickedOnce] = useState(false);

    const token_toast = () => {
        if (!user?.uid) {
            toast('Something went wrong!', {
                icon: <MdOutlineToken />,
            });
        } else {
            toast(user.uid, {
                icon: <MdOutlineToken />,
            });
        }
    };

    const group_toast = (text) => toast(text, {
        icon: <BiGroup />,
        autoClose: 250,
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

    function collabsToggle() {
        setCollabToggle(!collabToggle);
        console.log(!collabToggle)
        localStorage.setItem("collabToggle", collabToggle);
        setClickedOnce(!clickedOnce);
    }

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/');
        } catch (error) {
            console.error('Failed to log out:', error);
        }
    };

    return (
        <div className="navbar-container">
            <div className="navbar">
                <div className="navbar-logo-container">
                    <h1 className="navbar-logo">WebNote
                        <p>Neat-Easy-Collaborative</p>
                    </h1>
                </div>
                <input type="token" placeholder="Search" />
                <button className="search-btn"> <BiSearchAlt2 /> </button>
                <button className={`toggle-collab-btn ${clickedOnce ? 'button-clicked' : ''}`} onClick={() => { collabsToggle(); grop_toast_string() }}> <BiGroup /> </button>
                <button className="token-btn" onClick={token_toast}> <MdOutlineToken /> </button>
                <button className="sign-out-btn" onClick={handleLogout}> <PiSignOutBold /> </button>
                <div className="dropdown-menu">
                    <button className="compact-navbar-btn" > <BiMenu /> </button>
                    <ul className="dropdown-content">
                        <li>
                            <button className={`toggle-collab-2 ${clickedOnce ? 'button-clicked' : ''}`} onClick={() => { collabsToggle(); grop_toast_string() }}> <BiGroup /> </button>
                        </li>
                        <li>
                            <button className="token-btn-2" onClick={token_toast}> <MdOutlineToken /> </button>
                        </li>
                        <li>
                            <button className="sign-out-2" onClick={handleLogout}> <PiSignOutBold /> </button>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
