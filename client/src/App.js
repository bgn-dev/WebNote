import React from 'react';
import { BrowserRouter as BrowserRouter, Route, Routes } from "react-router-dom"
import './App.css';
import Login from './components/login'
import Grid from './components/grid'
import Note from './components/note'
import Collab from './components/collab'
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
            <Route path="/" element={<Login />} />
            <Route path="/popup" element={<Popup />} />
            <Route path="/grid" element={<Grid />} />
            <Route path="/note" element={<Note />} />
            <Route path="/collab" element={<Collab />} />
          </Routes>
        </BrowserRouter>
      </div>
    </div>
  );
}

export default App;
