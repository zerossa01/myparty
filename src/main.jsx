import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import RoomPage from './pages/RoomPage.jsx'
import JoinPage from './pages/JoinPage.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/join/:roomCode" element={<JoinPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
