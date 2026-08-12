
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './InstallAppModal.css'; // We will create this CSS file next

const InstallAppModal = ({ isOpen, onClose }) => {
    const [screen, setScreen] = useState(1);
    const [displayName, setDisplayName] = useState('');
    const [roomId, setRoomId] = useState('');
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (isOpen) {
            setScreen(1); // Reset to screen 1 every time the modal opens
            setDisplayName('');
            // Parse room ID from URL if available
            const queryParams = new URLSearchParams(location.search);
            const roomParam = queryParams.get('room');
            if (roomParam) {
                setRoomId(roomParam);
            } else {
                setRoomId(''); // Clear if not found
            }
        }
    }, [isOpen, location.search]);

    if (!isOpen) return null;

    const handleInstallApp = () => {
        // Redirect to checkout pipeline loop
        // This URL should be replaced with your actual Razorpay or payment gateway URL
        window.location.href = '/checkout'; 
    };

    const handleLogin = () => {
        navigate('/login');
        onClose();
    };

    const handleJoinMeeting = () => {
        // Assuming Mirotalk SFU is hosted at a specific base URL
        // The `displayName` and `roomId` are mapped directly to Mirotalk SFU's connection schema
        const mirotalksfuBaseUrl = 'https://mirotalksfu.yourdomain.com'; // REPLACE WITH ACTUAL MIROTALK SFU URL
        const joinUrl = `${mirotalksfuBaseUrl}/join/${roomId}?displayName=${encodeURIComponent(displayName)}`;
        window.open(joinUrl, '_blank'); // Open in new tab for guest access
        onClose();
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-container">
                {screen === 1 && (
                    <div className="modal-screen-1">
                        <h2 className="rcm-ai-branding">Welcome to RCM AI</h2>
                        <button className="modal-button primary" onClick={handleInstallApp}>
                            Install App & Get Full Access
                        </button>
                        <button className="modal-button secondary" onClick={handleLogin}>
                            Login
                        </button>
                        <p className="separator">— or —</p>
                        <button className="modal-button guest" onClick={() => setScreen(2)}>
                            Join Meeting as Guest
                        </button>
                    </div>
                )}

                {screen === 2 && (
                    <div className="modal-screen-2">
                        <button className="back-arrow" onClick={() => setScreen(1)}>
                            &larr; Back
                        </button>
                        <h3>Join Meeting as Guest</h3>
                        <input
                            type="text"
                            placeholder="Your Display Name"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="modal-input"
                        />
                        {roomId ? (
                            <p className="read-only-room-id">Room ID: {roomId}</p>
                        ) : (
                            <input
                                type="text"
                                placeholder="Enter Room ID"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                className="modal-input"
                            />
                        )}
                        <button className="modal-button primary" onClick={handleJoinMeeting}>
                            Join Meeting
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InstallAppModal;
