import { BrowserRouter, Route, Routes } from "react-router-dom"

import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


import './app.css';
import Login from './components/login'
import Grid from "./components/grid";
import Note from './components/note'
import Popup from './components/popup'
import ProtectedRoute from "./components/common/protected-route";
import { AuthProvider } from './firebase/auth';

function App() {
  return (
    <div className="App">
      <div className="App-Header">
        <AuthProvider>
          <BrowserRouter>
            <ToastContainer
              position="top-right"
              autoClose={20000}
              limit={1}
              hideProgressBar={false}
              newestOnTop={false}
              closeOnClick={false}
              rtl={false}
              pauseOnFocusLoss
              draggable={false}
              pauseOnHover
              theme="light"
            />
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/popup" element={<Popup />} />
              <Route path="/notes" element={
                <ProtectedRoute>
                  <Grid />
                </ProtectedRoute>
              }
              />
              <Route path="/note/:noteID" element={
                <ProtectedRoute>
                  <Note />
                </ProtectedRoute>
              }
              />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </div>
    </div>
  );
}

export default App;
