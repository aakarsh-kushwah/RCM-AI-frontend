import { io } from 'socket.io-client';

const socketUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';
const socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
});

export const socketService = {
    on: (event, callback) => {
        socket.on(event, callback);
        return () => socket.off(event, callback);
    },
    off: (event, callback) => {
        socket.off(event, callback);
    },
    getSocket: () => socket,
    onSyncProgress: (callback) => {
        socket.on('syncProgress', (data) => {
            callback(data);
        });
    },
    onLifelineSyncProgress: (callback) => {
        socket.on('lifelineSyncProgress', (data) => {
            callback(data);
        });
    },
    onWeakerLegReady: (callback) => {
        socket.on('weakerLegReady', (data) => {
            callback(data);
        });
    },
    disconnect: () => {
        socket.disconnect();
    },
    socket,
};

export default socketService;
