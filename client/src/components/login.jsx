import React from 'react'
import Axios from 'axios';
import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";

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
        Axios.post("http://localhost:8080/registrate", {
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
        Axios.post("http://localhost:8080/authenticate", {
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
        Axios.post("http://localhost:8080/generateToken", {
            id: token,
        })
            .then((response) => {
                console.log(response.data);
                setToken(response.data);
                setLog_Button("Sign Up")
            });
    };

    return (
        <div>
            <h1>Login</h1>
            <br></br>
            <div className="verification-container">
                <input type="token" value={token} placeholder="YOUR TOKEN" onChange={(e) => setToken(e.target.value)} />
            </div>
            <br></br>
            <button className="verificate_button" onClick={handleLogButton}>{log_button}</button>
            <br></br>
            <a>Don't have a token yet?</a>
            <br></br>
            <a onClick={generateToken}>Generate your token.</a>
        </div>
    )
}
