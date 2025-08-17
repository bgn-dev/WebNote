import { useAuth } from "../../firebase/auth";
import { Navigate } from 'react-router-dom';

const AuthLoading = () => {
    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100/50">
            <div className="text-center space-y-6">
                {/* Logo */}
                <div className="flex justify-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-slate-900 to-slate-700 rounded-xl shadow-lg">
                        <div className="relative">
                            <div className="w-3 h-3 bg-gradient-to-br from-blue-400 to-purple-500 rounded rotate-12 absolute animate-spin"></div>
                            <div className="w-3 h-3 bg-gradient-to-br from-purple-400 to-pink-500 rounded -rotate-12 relative ml-1 animate-spin" style={{animationDelay: '0.5s'}}></div>
                        </div>
                    </div>
                </div>

                {/* Loading Text */}
                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-slate-900">WebNote</h2>
                    <p className="text-sm text-slate-500">Authenticating...</p>
                </div>

                {/* Spinner */}
                <div className="flex justify-center">
                    <div className="w-8 h-8 border-2 border-slate-200 rounded-full animate-spin border-t-blue-500"></div>
                </div>
            </div>
        </div>
    );
};

const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();
    
    if (loading) {
        return <AuthLoading />;
    }
    
    return user ? children : <Navigate to="/" />;
};

export default ProtectedRoute;