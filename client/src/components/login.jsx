import React from 'react';
import Axios from 'axios';
import { useState } from 'react';
import { useNavigate } from "react-router-dom";

import { GoogleLogin } from '@react-oauth/google';
import { auth } from '../firebase/config';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

import './login.css';

export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [log_button, setLog_Button] = useState("Sign In")

    const handleActionButton = (e) => {
        if (log_button === "Sign In") {
            SignIn(e);
        } else {
            SignUp(e);
        }
    }

    const SignUp = async (e) => {
        e.preventDefault();
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            alert('User created successfully');
        } catch (err) {
            console.error(err);
        }
    };

    const SignIn = async (e) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, email, password);
            navigate("/grid");
        } catch (error) {
            shake_animation()
            //console.error(error);
        }
    };

    const createNewAccount = () => {
        //setEmail(response.data);
        setLog_Button("Sign Up")
    };

    function handleEMailChange(e) {
        setEmail(e.target.value)
    }

    function handlePasswordChange(e) {
        setPassword(e.target.value)
    }

    function shake_animation() {
        // Trigger the blinking effect on the token input field
        const tokenInput = document.querySelector('.input_verification input');
        tokenInput.classList.add('shake');
        // Remove the shake class after 0.5 seconds
        setTimeout(() => {
            tokenInput.classList.remove('shake');
        }, 500);
    }

    const responseMessage = (response) => {
        console.log(response);
    };
    const errorMessage = (error) => {
        console.log(error);
    };

    return (
        <div className="login_container">
            <h1>WebNote</h1>
            <div className="input_credentials">
                <input type="token" value={email} placeholder="E-Mail" onChange={(e) => handleEMailChange(e)} />
            </div>
            <div className="input_credentials">
                <input type="password" value={password} placeholder="Password" onChange={(e) => handlePasswordChange(e)} />
            </div>
            <div className="token_container">
                <a className="generate_token" onClick={createNewAccount}>New? Create a new Account!</a>
            </div>
            <button className="verificate_btn" onClick={handleActionButton}>{log_button}</button>
            <GoogleLogin onSuccess={responseMessage} onError={errorMessage} />
        </div>
    )
}
