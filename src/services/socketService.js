import { io } from 'socket.io-client';

const socket = io("http://localhost:10000", {
    transports: ["websocket", "polling"], // 👈 Dono allow karo
    withCredentials: true,
    reconnectionAttempts: 5,        // Max 5 reconnection attempts
    reconnectionDelay: 1000,        // Initial delay of 1 second
    reconnectionDelayMax: 5000,     // Max delay of 5 seconds
    timeout: 20000                  // Connection timeout
});
export const socketService = {
    onSyncProgress: (callback) => {
        socket.on('syncProgress', (data) => {
            callback(data);
        });
    },
    disconnect: () => {
        socket.disconnect();
    }
};

export default socketService;