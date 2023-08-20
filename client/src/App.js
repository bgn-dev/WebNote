import React from 'react';
import { BrowserRouter as Router, Route, Routes } from "react-router-dom"
import './App.css';
import Login from './components/login'
import Grid from './components/grid'
import Note from './components/note'
import Collab from './components/collab'

function App() {


  return (
    <div className="App">
      <div className="App-Header">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/grid" element={<Grid />} />
          <Route path="/note" element={<Note />} />
          <Route path="/collab" element={<Collab />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
