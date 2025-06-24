  import React from 'react';
  import { BrowserRouter, Route, Routes } from "react-router-dom"

  import { GoogleOAuthProvider } from '@react-oauth/google';

  import './App.css';
  import Login from './components/login'
  import Grid from './components/grid'
  import Note from './components/note'
  import Popup from './components/popup'

  import { ToastContainer } from 'react-toastify';
  import 'react-toastify/dist/ReactToastify.css';

  function App() {
    return (
      <div className="App">
        <div className="App-Header">
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
              <Route path="/"
                element={
                  <GoogleOAuthProvider clientId='785362641992-too476gno7bvkmdbs4e6qi33fbr3aggb.apps.googleusercontent.com'>
                    <Login />
                  </GoogleOAuthProvider>
                }
              />
              <Route path="/popup" element={<Popup />} />
              <Route path="/grid" element={<Grid />} />
              <Route path="/note" element={<Note />} />
            </Routes>
          </BrowserRouter>
        </div>
      </div>
    );
  }

  export default App;
