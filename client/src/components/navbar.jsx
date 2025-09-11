import { useState, useEffect } from 'react'
import { useNavigate } from "react-router-dom";

import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { useAuth } from '../firebase/auth';

import { PiSignOutBold } from 'react-icons/pi';
import { BiSearchAlt2 } from 'react-icons/bi';
import { BiGroup } from 'react-icons/bi';
import { BiMenu } from 'react-icons/bi';

export default function Navbar({ collabToggle, setCollabToggle }) {
    const navigate = useNavigate();

    const { user, logout } = useAuth();

    const [showDropdown, setShowDropdown] = useState(false);

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

                    {/* Search Bar */}
                    <div className="hidden md:flex flex-1 max-w-lg mx-8">
                        <div className="relative w-full">
                            <input
                                type="text"
                                placeholder="Search notes..."
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:border-slate-400 focus:bg-white transition-all duration-300 font-light text-base"
                            />
                            <BiSearchAlt2 className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
                        </div>
                    </div>

                    {/* Desktop Actions */}
                    <div className="hidden md:flex items-center space-x-3">
                        <button
                            onClick={() => { collabsToggle(); grop_toast_string() }}
                            className={`px-4 py-3 rounded-xl transition-all duration-300 font-medium ${collabToggle
                                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 shadow-sm'
                                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                        >
                            <BiGroup className="w-5 h-5" />
                        </button>

                        <button
                            onClick={handleLogout}
                            className="px-4 py-3 text-slate-700 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300 font-medium"
                        >
                            <PiSignOutBold className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden relative">
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="px-4 py-3 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-300 font-medium"
                        >
                            <BiMenu className="w-6 h-6" />
                        </button>

                        {/* Mobile Dropdown */}
                        {showDropdown && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/50 py-3">
                                <div className="px-4 py-3">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Search..."
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:border-slate-400 text-base font-light"
                                        />
                                        <BiSearchAlt2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
                                    </div>
                                </div>

                                <div className="border-t border-slate-200/50 mt-2 pt-2">
                                    <button
                                        onClick={() => {
                                            collabsToggle();
                                            grop_toast_string();
                                            setShowDropdown(false);
                                        }}
                                        className={`w-full flex items-center space-x-3 px-4 py-4 text-left transition-all duration-300 font-medium ${collabToggle
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-slate-700 hover:bg-slate-50'
                                            }`}
                                    >
                                        <BiGroup className="w-5 h-5" />
                                        <span className="font-light">Collaboration</span>
                                    </button>

                                    <button
                                        onClick={() => {
                                            handleLogout();
                                            setShowDropdown(false);
                                        }}
                                        className="w-full flex items-center space-x-3 px-4 py-4 text-slate-700 hover:bg-red-50 hover:text-red-600 transition-all duration-300 font-medium"
                                    >
                                        <PiSignOutBold className="w-5 h-5" />
                                        <span className="font-light">Sign Out</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}