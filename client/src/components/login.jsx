import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../firebase/auth';
import { FcGoogle } from "react-icons/fc";

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [emailFocused, setEmailFocused] = useState(false);
    const [passwordFocused, setPasswordFocused] = useState(false);

    const { login, loginWithGoogle, signup } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setError('');
            setLoading(true);
            
            if (isSignUp) {
                await signup(email, password);
            } else {
                await login(email, password);
            }
            
            navigate('/grid');
        } catch (error) {
            setError(`Failed to ${isSignUp ? 'create account' : 'sign in'}: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setError('');
            setLoading(true);
            await loginWithGoogle();
            navigate('/grid');
        } catch (error) {
            setError('Failed to sign in with Google: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        setIsSignUp(!isSignUp);
        setError('');
    };

    return (
        <div className="h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex font-['Inter',system-ui,sans-serif]">
            {/* Left Side - Static Elegant Branding */}
            <div className="hidden lg:flex lg:w-3/5 h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 items-center justify-center p-12 relative overflow-hidden">
                {/* Sophisticated background elements */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.3),transparent_50%)]"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.2),transparent_50%)]"></div>
                <div className="absolute w-96 h-96 -top-48 -right-48 rounded-full bg-gradient-to-br from-blue-400/20 to-purple-600/20 blur-3xl"></div>
                <div className="absolute w-80 h-80 -bottom-40 -left-40 rounded-full bg-gradient-to-tr from-indigo-500/20 to-cyan-400/20 blur-3xl"></div>
                
                {/* Refined brand content */}
                <div className="text-center text-white relative z-10 max-w-lg">
                    {/* Modern logo with geometric design */}
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-white/10 backdrop-blur-xl rounded-2xl mb-8 shadow-2xl border border-white/20">
                        <div className="relative">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg rotate-12 absolute"></div>
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg -rotate-12 relative ml-2"></div>
                        </div>
                    </div>
                    
                    <h1 className="text-6xl font-extralight mb-4 tracking-[-0.02em] bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent">
                        WebNote
                    </h1>
                    <p className="text-xl text-white/70 mb-12 font-light leading-relaxed">
                        Craft ideas with <span className="text-blue-300 font-medium">precision</span> and <span className="text-purple-300 font-medium">elegance</span>
                    </p>
                    
                    {/* Elegant feature showcase */}
                    <div className="space-y-6 text-white/60">
                        {[
                            { icon: "✦", text: "Real-time collaboration", color: "text-blue-300" },
                            { icon: "◆", text: "End-to-end encryption", color: "text-purple-300" },
                            { icon: "✧", text: "Distraction-free writing", color: "text-cyan-300" }
                        ].map((feature, index) => (
                            <div key={index} className="flex items-center space-x-4 group">
                                <span className={`text-lg ${feature.color} group-hover:scale-110 transition-transform duration-300`}>
                                    {feature.icon}
                                </span>
                                <span className="font-light tracking-wide group-hover:text-white/80 transition-colors duration-300">
                                    {feature.text}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            {/* Right Side - Scrollable Login Form */}
            <div className="w-full lg:w-2/5 h-screen overflow-y-auto bg-white/80 backdrop-blur-sm relative">
                <div className="min-h-full flex items-center justify-center p-8">
                    {/* Elegant login container */}
                    <div className="w-full max-w-md relative my-8">
                        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-white/20 relative overflow-hidden">
                            {/* Subtle gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent pointer-events-none"></div>
                            
                            <div className="relative z-10">
                                {/* Header with better typography */}
                                <div className="mb-8">
                                    <p className="text-slate-500 font-light">
                                        {isSignUp 
                                            ? 'Create your account to get started' 
                                            : 'Continue to your workspace'
                                        }
                                    </p>
                                </div>

                                {error && (
                                    <div className="mb-6 p-4 bg-red-50/80 backdrop-blur-sm border border-red-200/50 rounded-2xl">
                                        <p className="text-red-600 text-sm font-medium">{error}</p>
                                    </div>
                                )}
                                
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    {/* Floating label email input */}
                                    <div className="relative">
                                        <input 
                                            type="email" 
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            onFocus={() => setEmailFocused(true)}
                                            onBlur={() => setEmailFocused(false)}
                                            className="peer w-full px-4 pt-6 pb-2 bg-slate-50/50 border border-slate-200/50 rounded-2xl text-slate-900 placeholder-transparent focus:outline-none focus:border-slate-400 focus:bg-white/80 transition-all duration-300"
                                            placeholder="Email address"
                                            required
                                        />
                                        <label className={`absolute left-4 transition-all duration-300 pointer-events-none ${
                                            emailFocused || email 
                                                ? 'top-2 text-xs text-slate-600 font-medium' 
                                                : 'top-4 text-base text-slate-400'
                                        }`}>
                                            Email address
                                        </label>
                                    </div>
                                    
                                    {/* Floating label password input */}
                                    <div className="relative">
                                        <input 
                                            type="password" 
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            onFocus={() => setPasswordFocused(true)}
                                            onBlur={() => setPasswordFocused(false)}
                                            className="peer w-full px-4 pt-6 pb-2 bg-slate-50/50 border border-slate-200/50 rounded-2xl text-slate-900 placeholder-transparent focus:outline-none focus:border-slate-400 focus:bg-white/80 transition-all duration-300"
                                            placeholder="Password"
                                            required
                                        />
                                        <label className={`absolute left-4 transition-all duration-300 pointer-events-none ${
                                            passwordFocused || password 
                                                ? 'top-2 text-xs text-slate-600 font-medium' 
                                                : 'top-4 text-base text-slate-400'
                                        }`}>
                                            Password
                                        </label>
                                        {!isSignUp && (
                                            <button 
                                                type="button"
                                                className="absolute right-4 top-4 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors duration-200"
                                            >
                                                Forgot?
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* Terms/Remember - More elegant */}
                                    {!isSignUp ? (
                                        <div className="flex items-center space-x-3">
                                            <input 
                                                type="checkbox" 
                                                id="remember" 
                                                className="w-4 h-4 text-slate-600 border-slate-300 rounded focus:ring-slate-500/20 focus:ring-2"
                                            />
                                            <label htmlFor="remember" className="text-sm text-slate-600 font-light">
                                                Keep me signed in
                                            </label>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-slate-500 font-light leading-relaxed">
                                            By creating an account, you agree to our{' '}
                                            <a href="#" className="text-slate-700 hover:text-slate-900 font-medium underline underline-offset-2">
                                                Terms of Service
                                            </a>
                                            {' '}and{' '}
                                            <a href="#" className="text-slate-700 hover:text-slate-900 font-medium underline underline-offset-2">
                                                Privacy Policy
                                            </a>
                                        </div>
                                    )}
                                    
                                    {/* Premium submit button */}
                                    <button 
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-gradient-to-r from-slate-900 to-slate-700 text-white font-medium py-4 rounded-2xl hover:from-slate-800 hover:to-slate-600 transform hover:scale-[1.02] hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none relative overflow-hidden group"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                                        {loading ? (
                                            <div className="flex items-center justify-center space-x-2">
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                <span className="font-light">{isSignUp ? 'Creating account...' : 'Signing you in...'}</span>
                                            </div>
                                        ) : (
                                            <span className="relative z-10 font-medium tracking-wide">
                                                {isSignUp ? 'Create Account' : 'Sign In'}
                                            </span>
                                        )}
                                    </button>
                                    
                                    {/* Refined divider */}
                                    <div className="relative my-8">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-slate-200"></div>
                                        </div>
                                        <div className="relative flex justify-center">
                                            <span className="px-6 bg-white text-slate-400 text-sm font-light tracking-wide">
                                                Or continue with
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* Elegant Google button */}
                                    <button 
                                        type="button"
                                        onClick={handleGoogleLogin}
                                        disabled={loading}
                                        className="w-full bg-white border border-slate-200 text-slate-700 font-medium py-4 rounded-2xl hover:bg-slate-50 hover:border-slate-300 hover:shadow-lg flex items-center justify-center space-x-3 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none group"
                                    >
                                        <FcGoogle className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
                                        <span className="font-light tracking-wide">Continue with Google</span>
                                    </button>
                                    
                                    {/* Refined mode toggle */}
                                    <div className="text-center pt-6">
                                        <p className="text-slate-500 font-light">
                                            {isSignUp ? 'Already have an account?' : 'New to WebNote?'}
                                            <button
                                                type="button"
                                                onClick={toggleMode}
                                                className="text-slate-700 hover:text-slate-900 font-medium ml-2 underline underline-offset-2 decoration-slate-300 hover:decoration-slate-600 transition-all duration-200"
                                            >
                                                {isSignUp ? 'Sign in instead' : 'Create account'}
                                            </button>
                                        </p>
                                    </div>
                                </form>
                            </div>
                        </div>
                        
                        {/* Minimal footer */}
                        <div className="text-center mt-8">
                            <p className="text-slate-400 text-sm font-light tracking-wide">
                                Trusted
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}