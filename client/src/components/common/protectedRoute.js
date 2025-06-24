import { useAuth } from "../../firebase/auth";
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>; // Or your loading component
  }

  return user ? children : <Navigate to="/" />;
};

export default ProtectedRoute;