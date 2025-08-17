from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
app.secret_key = 'random secret key!'
socketio = SocketIO(app, cors_allowed_origins="*", engineio_logger=True)


active_connections = []  # Track connections by room

@socketio.on("join")
def handle_join(message):
    username = message.get("username")
    room = message.get("room")
    sid = request.sid
    
    if not username or not room:
        emit("error", {"message": "Username and room are required!"})
        return

    if room not in active_connections:
        active_connections[room] = {}

    join_room(room)
    is_offerer = len(active_connections[room]) == 0
    active_connections[room].append = username

    emit("ready", {
        "username": username,
    }, to=sid)

    # Notify the other peer when second user joins
    if len(active_connections[room]) == 2:
        for other_sid in active_connections[room]:
            if other_sid != sid:
                emit("peer_ready", to=other_sid)

@socketio.on("data")
def handle_data(message):
    username = message.get("username")
    room = message.get("room")
    data = message.get("data")
    
    if not all([username, room, data]):
        emit("error", {"message": "Invalid data format!"})
        return

    print(f"Data from {username} in {room}: {data}")
    emit("data", {
        "username": username,
        "room": room,
        "data": data  # <-- the inner signaling data
    }, to=room, skip_sid=request.sid)

@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    for room, connections in active_connections.items():
        if sid in connections:
            username = connections[sid]["username"]
            print(f"User {username} left room {room}")
            del connections[sid]
            
            # Notify remaining users
            for other_sid in connections:
                emit("peer_left", {"username": username}, to=other_sid)
            
            # Cleanup empty rooms
            if not connections:
                del active_connections[room]
            break

if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=9000, debug=True)