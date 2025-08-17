import { useParams } from "react-router-dom";
import { useRef, useEffect, useState } from "react";
import socketio from "socket.io-client";

function CallScreen() {
    const params = useParams();
    const localUsername = params.username;
    const roomName = params.room;

    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");

    const socketRef = useRef(null);
    const socketConnectionStarted = useRef(false);

    let pc; // For RTCPeerConnection Object
    let dataChannel; // For RTCDataChannel

    const sendData = (data) => {
        socketRef.current.emit("data", {
            username: localUsername,
            room: roomName,
            data: data,
        });
    };

    const onIceCandidate = (event) => {
        if (event.candidate) {
            console.log("Sending ICE candidate");
            sendData({
                type: "candidate",
                candidate: event.candidate,
            });
        }
    };

    const createPeerConnection = (isOfferer) => {
        try {
            pc = new RTCPeerConnection({});
            pc.onicecandidate = onIceCandidate;

            if (isOfferer) {
                // Create a data channel only if you're the offerer
                dataChannel = pc.createDataChannel("chat");
                setupDataChannel();
            } else {
                // As the answerer, wait for the data channel
                pc.ondatachannel = (event) => {
                    dataChannel = event.channel;
                    setupDataChannel();
                };
            }

            console.log("PeerConnection created");
        } catch (error) {
            console.error("PeerConnection failed: ", error);
        }
    };

    const setupDataChannel = () => {
        dataChannel.onopen = () => {
            console.log("DataChannel opened!");
            setMessages((prev) => [...prev, "DataChannel connected!"]);
        };
        dataChannel.onmessage = (event) => {
            console.log("Message received:", event.data);
            setMessages((prev) => [...prev, `Remote: ${event.data}`]);
        };
        dataChannel.onclose = () => {
            console.log("DataChannel closed");
        };
    };


    const setAndSendLocalDescription = (sessionDescription) => {
        pc.setLocalDescription(sessionDescription);
        console.log("Local description set");
        sendData(sessionDescription);
    };

    const sendOffer = () => {
        console.log("Sending offer");
        pc.createOffer().then(setAndSendLocalDescription, (error) => {
            console.error("Send offer failed: ", error);
        });
    };

    const sendAnswer = () => {
        console.log("Sending answer");
        return pc.createAnswer().then(setAndSendLocalDescription, (error) => {
            console.error("Send answer failed: ", error);
        });
    };

    const signalingDataHandler = async (data) => {
        if (data.type === "offer") {
            createPeerConnection();
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data));
                await sendAnswer();
            } catch (error) {
                console.error("Error handling offer: ", error);
            }
        } else if (data.type === "answer") {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data));
            } catch (error) {
                console.error("Error setting remote answer: ", error);
            }
        } else if (data.type === "candidate") {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
                console.error("Error adding ICE candidate: ", error);
            }
        } else {
            console.log("Unknown Data", data);
        }
    };


    const sendMessage = () => {
        if (dataChannel && dataChannel.readyState === "open" && inputMessage.trim()) {
            dataChannel.send(inputMessage);
            setMessages((prev) => [...prev, `You: ${inputMessage}`]);
            setInputMessage("");
        }
    };

    useEffect(() => {
        console.log("useEffect called, socketConnectionStarted:", socketConnectionStarted.current);
        if (socketConnectionStarted.current) return;

        socketConnectionStarted.current = true;
        console.log("init-----");

        socketRef.current = socketio("http://localhost:9000", {
            autoConnect: false,
        });

        const socket = socketRef.current;

        socket.on("ready", (data) => {
            console.log("Ready to Connect!", data);
            createPeerConnection(data.isOfferer);  // pass the flag
            if (data.isOfferer) {
                sendOffer();
            }
        });

        socket.on("data", (data) => {
            console.log("Received signaling data:", data); // ← should show full object
            signalingDataHandler(data.data); // <-- or data.data if you kept the structure
        });

        socket.connect();
        socket.emit("join", { username: localUsername, room: roomName });
        console.log("send join emit");

        return function cleanup() {
            if (dataChannel) dataChannel.close();
            if (pc) pc.close();
            if (socket) socket.disconnect();
            socketConnectionStarted.current = false;
        };
    }, []);

    return (
        <div>
            <h2>WebRTC DataChannel Chat</h2>
            <p>Username: {localUsername}</p>
            <p>Room: {roomName}</p>

            <div style={{ border: "1px solid #ccc", padding: "10px", height: "300px", overflowY: "auto" }}>
                {messages.map((msg, index) => (
                    <div key={index}>{msg}</div>
                ))}
            </div>

            <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a message..."
            />
            <button onClick={sendMessage}>Send</button>
        </div>
    );
}

export default CallScreen;