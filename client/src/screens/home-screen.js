import { useState } from "react";
import { Link } from "react-router-dom";

function HomeScreen() {
  const [room, setRoom] = useState("");
  const [username, setUsername] = useState("");

  return (
    <div style={{ padding: "20px" }}>
      <h1>WebNote - Join Room</h1>
      
      <div style={{ marginBottom: "10px" }}>
        <label>Username:</label>
        <br />
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          style={{ padding: "8px", width: "200px" }}
        />
      </div>

      <div style={{ marginBottom: "15px" }}>
        <label>Room:</label>
        <br />
        <input
          type="text"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Enter room name"
          style={{ padding: "8px", width: "200px" }}
        />
      </div>

      <Link to={`/call/${username}/${room}`}>
        <button 
          disabled={!username || !room}
          style={{ 
            padding: "10px 20px", 
            backgroundColor: !username || !room ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            cursor: !username || !room ? "not-allowed" : "pointer"
          }}
        >
          Join Room
        </button>
      </Link>
    </div>
  );
}

export default HomeScreen;