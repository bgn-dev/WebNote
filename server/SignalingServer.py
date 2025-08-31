from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
app.secret_key = 'random secret key!'
socketio = SocketIO(app, cors_allowed_origins="*")

active_connections = {}  # Track connections by room

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on("join")
def handle_join(message):
    print(f"JOIN event received: {message}")
    username = message.get("username")
    room = message.get("room")
    sid = request.sid
    print(f"User {username} wants to join room {room} with sid {sid}")
    
    if not username or not room:
        emit("error", {"message": "Username and room are required!"})
        return

    # Create not existing room
    if room not in active_connections:
        active_connections[room] = {}

    # Check if this username is already in the room with a different sid (refresh case)
    existing_sids_to_remove = []
    for existing_sid, user_data in active_connections[room].items():
        if user_data["username"] == username and existing_sid != sid:
            print(f"Found existing connection for {username}: {existing_sid}, removing it")
            existing_sids_to_remove.append(existing_sid)
    
    # Remove old connections for the same user
    for old_sid in existing_sids_to_remove:
        del active_connections[room][old_sid]
        emit("peer_left", {"sid": old_sid, "username": username}, to=room)

    join_room(room)
    active_connections[room][sid] = {"username": username}

    # Get list of existing peers
    existing_peers = []
    for peer_sid, peer_data in active_connections[room].items():
        if peer_sid != sid:
            existing_peers.append({"sid": peer_sid, "username": peer_data["username"]})

    # Send ready with existing peers to new joiner
    print(f"Sending ready to {username} with {len(existing_peers)} existing peers")
    emit("ready", {
        "username": username,
        "peers": existing_peers
    }, to=sid)

    # Notify existing peers about new joiner
    print(f"Notifying room {room} about new peer {username}")
    emit("new_peer", {
        "sid": sid,
        "username": username
    }, to=room, skip_sid=sid)

@socketio.on("data")
def handle_data(message):
    username = message.get("username")
    room = message.get("room")
    target_peer_id = message.get("targetPeerId")
    data = message.get("data")
    
    if not all([username, room, target_peer_id, data]):
        emit("error", {"message": "Invalid data format! username, room, targetPeerId, and data are required."})
        return

    print(f"Data from {username} to {target_peer_id} in {room}: {data}")
    emit("data", {
        "username": username,
        "room": room,
        "senderId": request.sid,
        "data": data
    }, to=target_peer_id)

@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    for room, connections in active_connections.items():
        if sid in connections:
            username = connections[sid]["username"]
            print(f"User {username} left room {room}")
            del connections[sid]
            
            # Notify remaining users
            emit("peer_left", {"sid": sid, "username": username}, to=room)
            
            # Cleanup empty rooms
            if not connections:
                del active_connections[room]
            break

if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=9000, debug=True)