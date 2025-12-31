import { useState, useEffect } from 'react'
import { useNavigate } from "react-router-dom";

import { useAuth } from '../firebase/auth';

import { PiSignOutBold } from 'react-icons/pi';
import { BiGroup, BiUser } from 'react-icons/bi';

export default function Navbar({ collabToggle, setCollabToggle }) {
    const navigate = useNavigate();

    const { user, logout } = useAuth();

    useEffect(() => {
        localStorage.setItem("collabToggle", JSON.stringify(collabToggle));
    }, [collabToggle]);

    function collabsToggle() {
        setCollabToggle(prev => !prev);
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
        <nav className="bg-white/95 backdrop-blur-xl border-b border-slate-200/50 sticky top-0 z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-6">
                <div className="flex items-center justify-between h-20">
                    {/* Logo */}
                    <div className="flex items-center space-x-4">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-slate-900 to-slate-700 rounded-xl shadow-lg">
                            <div className="relative">
                                <div className="w-3 h-3 bg-gradient-to-br from-blue-400 to-purple-500 rounded rotate-12 absolute"></div>
                                <div className="w-3 h-3 bg-gradient-to-br from-purple-400 to-pink-500 rounded -rotate-12 relative ml-1"></div>
                            </div>
                        </div>
                        <div>
                            <h1 className="text-xl font-light text-slate-900 tracking-tight">WebNote</h1>
                            <p className="text-xs text-slate-600 font-light -mt-1">Neat-Easy-Collaborative</p>
                        </div>
                    </div>

                    {/* Desktop Actions */}
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={() => { collabsToggle() }}
                            className="flex items-center space-x-2 px-4 py-3 rounded-xl transition-all duration-300 font-medium text-slate-700 hover:bg-slate-100"
                        >
                            {collabToggle ? (
                                <>
                                    <BiGroup className="w-5 h-5" />
                                    <span className="text-sm">Collaborative</span>
                                </>
                            ) : (
                                <>
                                    <BiUser className="w-5 h-5" />
                                    <span className="text-sm">Personal</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={handleLogout}
                            className="px-4 py-3 text-slate-700 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300 font-medium"
                        >
                            <PiSignOutBold className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}