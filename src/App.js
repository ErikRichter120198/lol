import React, { useState, useRef, useEffect, useCallback } from 'react';

const App = () => {
    const [ws, setWs] = useState(null);
    const [roomID, setRoomID] = useState('');
    const [isInRoom, setIsInRoom] = useState(false);
    const localVideoRef = useRef();
    const remoteVideoRef = useRef();
    const localStreamRef = useRef();
    const peerConnectionRef = useRef();

    const setupLocalStream = useCallback(() => {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                localStreamRef.current = stream;
                localVideoRef.current.srcObject = stream;
                localVideoRef.current.play();
            })
            .catch(error => {
                console.error('Error accessing media devices.', error);
            });
    }, []);

    const createPeerConnection = useCallback(() => {
        peerConnectionRef.current = new RTCPeerConnection();

        peerConnectionRef.current.onicecandidate = (event) => {
            if (event.candidate) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'signal', roomID, message: { candidate: event.candidate } }));
                }
            }
        };

        peerConnectionRef.current.ontrack = (event) => {
            remoteVideoRef.current.srcObject = event.streams[0];
            remoteVideoRef.current.play();
        };

        localStreamRef.current.getTracks().forEach(track => peerConnectionRef.current.addTrack(track, localStreamRef.current));

        peerConnectionRef.current.createOffer().then(offer => {
            return peerConnectionRef.current.setLocalDescription(offer);
        }).then(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'signal', roomID, message: peerConnectionRef.current.localDescription }));
            }
        });
    }, [ws, roomID]);

    const handleSignal = useCallback((message) => {
        if (!peerConnectionRef.current) {
            console.error("Peer connection is not initialized");
            return;
        }

        if (message.candidate) {
            peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(message.candidate));
        } else if (message.sdp) {
            peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(message.sdp)).then(() => {
                if (message.sdp.type === 'offer') {
                    peerConnectionRef.current.createAnswer().then(answer => {
                        return peerConnectionRef.current.setLocalDescription(answer);
                    }).then(() => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'signal', roomID, message: peerConnectionRef.current.localDescription }));
                        }
                    });
                }
            }).catch(error => {
                console.error("Error setting remote description:", error);
            });
        }
    }, [ws, roomID]);

    useEffect(() => {
        const ws = new WebSocket('ws://localhost:3000');
        setWs(ws);

        ws.onopen = () => {
            console.log('WebSocket connection established');
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            window.requestAnimationFrame(() => {
                switch (data.type) {
                    case 'created':
                        alert(`Room created with ID: ${data.roomID}`);
                        setRoomID(data.roomID);
                        break;

                    case 'joined':
                        alert(`Joined room: ${data.roomID}`);
                        setIsInRoom(true);
                        setupLocalStream();
                        break;

                    case 'new_member':
                        createPeerConnection();
                        break;

                    case 'signal':
                        handleSignal(data.message);
                        break;

                    default:
                        break;
                }
            });
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('WebSocket connection closed');
        };

        return () => {
            ws.close();
        };
    }, [setupLocalStream, createPeerConnection, handleSignal]);

    const createRoom = () => {
        console.log('Attempting to create room...');
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'create' }));
        } else {
            console.error('WebSocket is not open. Current state:', ws ? ws.readyState : 'No WebSocket');
        }
    };

    const joinRoom = () => {
        if (roomID && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'join', roomID }));
        }
    };

    return (
        <div>
            <h1>Video Conference</h1>
            {!isInRoom ? (
                <div>
                    <button onClick={createRoom}>Create Room</button>
                    <input value={roomID} onChange={(e) => setRoomID(e.target.value)} placeholder="Enter Room ID to join" />
                    <button onClick={joinRoom}>Join Room</button>
                </div>
            ) : (
                <div>
                    <h2>Room ID: {roomID}</h2>
                    <div>
                        <video ref={localVideoRef} muted />
                        <video ref={remoteVideoRef} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
