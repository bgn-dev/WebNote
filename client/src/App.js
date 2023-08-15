import React from 'react';
import { BrowserRouter as Router, Route, Routes } from "react-router-dom"
import './App.css';
import Login from './components/login'
import Grid from './components/grid'
import Note from './components/note'

function App() {


  return (
    <div className="App">
      <header className="App-header">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/grid" element={<Grid />} />
          <Route path="/note" element={<Note />} />
        </Routes>
      </header>
    </div>
  );
}

export default App;
