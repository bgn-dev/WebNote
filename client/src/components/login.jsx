import React from 'react';
import Axios from 'axios';
import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";

import './login.css';

import { MdOutlineToken } from 'react-icons/md';

export default function Login() {
    const navigate = useNavigate();
    const [token, setToken] = useState("");
    const [log_button, setLog_Button] = useState("Sign In")
    const [changeState, setChangeState] = useState(false);

    const handleLogButton = () => {
        if (log_button === "Sign In") {
            handleSignIn();
        } else {
            handleSignUp();
        }
    }
    // initiate the post request via axios for the login
    const handleSignUp = () => {
        Axios.post("http://localhost:9999/registrate", {
            id: token,
        })
            .then((response) => {
                console.log(response.data);
                localStorage.setItem("currentUser", response.data.id);
                navigate("/grid");
            })
            .catch((error) => {
                console.error("An error occurred:", error);
            })
            ;
    };

    const handleSignIn = () => {
        if (token.trim() === "") {
            // Display an error message or take appropriate action for empty input
            console.log("Token does not have the norms.");
            return;
        }
        Axios.post("http://localhost:9999/authenticate", {
            id: token,
        })
            .then((response) => {
                console.log(response.data);
                localStorage.setItem("currentUser", response.data.id);
                navigate("/grid");
            })
            .catch((error) => {
                console.error("An error occurred:", error);
            })
            ;
    }

    const generateToken = () => {
        Axios.post("http://localhost:9999/generateToken", {
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
