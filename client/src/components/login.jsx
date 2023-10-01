import React from 'react';
import Axios from 'axios';
import { useState } from 'react';
import { useNavigate } from "react-router-dom";

import './login.css';

import { MdOutlineToken } from 'react-icons/md';

export default function Login() {
    const navigate = useNavigate();
    const [token, setToken] = useState("");
    const [log_button, setLog_Button] = useState("Sign In")

    const handleLogButton = () => {
        if (log_button === "Sign In") {
            handleSignIn();
        } else {
            handleSignUp();
        }
    }

    // initiate the post request via axios for the login
    const handleSignUp = () => {
        //Axios.post("https://neat-note-4478e343a4f5.herokuapp.com/registrate", {
        Axios.post("http://localhost:5000/registrate", {
            id: token,
        })
            .then((response) => {
                console.log(response.data);
                localStorage.setItem("currentUser", response.data.id);
                navigate("/grid");
            })
            .catch((error) => {
                console.error("An error occurred:", error);
            });
    };

    const handleSignIn = () => {
        //Axios.post("https://neat-note-4478e343a4f5.herokuapp.com/authenticate", {
        Axios.post("http://localhost:5000/authenticate", {
            id: token,
        })
            .then((response) => {
                console.log(response.data);
                localStorage.setItem("currentUser", response.data.id);
                navigate("/grid");
            })
            .catch((error) => {
                console.error("An error occurred:", "Token is not valid");
                shake_animation();
            });
    }

    const generateToken = () => {
        //Axios.post("https://neat-note-4478e343a4f5.herokuapp.com/generateToken", {
        Axios.post("http://localhost:5000/generateToken", {
            id: token,
        })
            .then((response) => {
                console.log(response.data);
                setToken(response.data);
                setLog_Button("Sign Up")
            });
    };

    function handleInputChange(e) {
        setToken(e.target.value)
        setLog_Button("Sign In")
    }

    function shake_animation() {
        // Trigger the blinking effect on the token input field
        const tokenInput = document.querySelector('.input_verification input[type="token"]');
        tokenInput.classList.add('shake');
        // Remove the shake class after 0.5 seconds
        setTimeout(() => {
            tokenInput.classList.remove('shake');
        }, 500);
    }

    return (
        <div className="login_container">
            <h1>WebNote</h1>
            <div className="input_verification">
                <input type="token" value={token} placeholder="Token" onChange={(e) => handleInputChange(e)} />
                <i><MdOutlineToken /></i>
            </div>
            <div className="token_container">
                <a>Don't have a token yet?</a>
                <a className="generate_token" onClick={generateToken}>Generate your token.</a>
            </div>
            <button className="verificate_btn" onClick={handleLogButton}>{log_button}</button>
        </div>
    )
}
