import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../firebase/auth';

import './login.css';

import { FcGoogle } from "react-icons/fc";

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [log_button, setLog_Button] = useState('Sign In');

    const { login, loginWithGoogle, signup } = useAuth();
    const navigate = useNavigate();

    const handleActionButton = (e) => {
        if (log_button === 'Sign In') {
            SignIn(e);
        } else {
            SignUp(e);
        }
    }

    const SignUp = async (e) => {
        e.preventDefault();
        try {
            setError('');
            setLoading(true);
            const userCredential = await signup(email, password);
            navigate('grid');
        } catch (error) {
            setError('Failed to log in: ' + error.message);
            console.error(error);
        }
    };

    const SignIn = async (e) => {
        e.preventDefault();
        try {
            setError('');
            setLoading(true);
            const userCredential =  await login(email, password);
            navigate('/grid');
            console.log(userCredential);
        } catch (error) {
            setError('Failed to log in: ' + error.message);
            console.error(error);
            shake_animation();
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setError('');
            setLoading(true);
            const userCredential = await loginWithGoogle();
            navigate('/grid');
        } catch (error) {
            setError('Failed to log in with Google: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const createNewAccount = () => {
        setLog_Button('Sign Up');
    };

    function handleEMailChange(e) {
        setEmail(e.target.value);
    }

    function handlePasswordChange(e) {
        setPassword(e.target.value);
    }

    function shake_animation() {
        // Trigger the blinking effect on the token input field
        const tokenInput = document.querySelector('.verificate_btn');
        tokenInput.classList.add('shake');
        // Remove the shake class after 0.5 seconds
        setTimeout(() => {
            tokenInput.classList.remove('shake');
        }, 500);
    }

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
            <button className='googleSignIn_btn' onClick={handleGoogleLogin} disabled={loading}>
                <FcGoogle/>
            </button>
        </div>
    )
}
