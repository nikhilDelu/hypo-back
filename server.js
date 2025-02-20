require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Initialize Express and HTTP Server
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());
app.use(cors());

// In-memory storage for users and rooms
const users = {};  // { username: { points: 100 } }
const rooms = {};  // { roomID: { entryFee, totalPoints, users: [], winner: null } }

// API to create a user
app.post('/api/users/create', (req, res) => {
    const { username } = req.body;
    if (users[username]) return res.status(400).json({ error: "User already exists" });

    users[username] = { points: 100 };  // Default points
    res.json({ message: "User created", user: { username, points: 100 } });
});

// API to get user info
app.get('/api/users/:username', (req, res) => {
    const user = users[req.params.username];
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
});

// API to get all rooms
app.get('/api/rooms', (req, res) => {
    res.json(rooms);
});

const generateRoomID = () => "room-" + Math.random().toString(36).substr(2, 9);

// WebSocket connection
io.on('connection', (socket) => {
    console.log(`⚡ User connected: ${socket.id}`);
    //Create Room
        socket.on("createRoom", ({ username, entryFee }) => {
            if (!users[username]) users[username] = { points: 500 };  // Assign default points
    
            const roomID = generateRoomID();
            rooms[roomID] = { entryFee, totalPoints: 50, users: [{ username, pointsSubmitted: entryFee }], host: username, winner: null };
            users[username].points -= entryFee;

            socket.join(roomID);
            socket.emit("roomCreated", { roomID, inviteLink: `http://localhost:5173/join?roomID=${roomID}` });
        });

    // User joins a quiz room
    socket.on("joinRoom", ({ username, roomID }) => {
        if (!rooms[roomID]) return socket.emit("error", "Room not found");
        if (!users[username]) users[username] = { points: 500 };
        if (users[username].points < rooms[roomID].entryFee) return socket.emit("error", "Not enough points");

        users[username].points -= rooms[roomID].entryFee;
        rooms[roomID].users.push({ username, pointsSubmitted: rooms[roomID].entryFee });
        rooms[roomID].totalPoints += rooms[roomID].entryFee;

        socket.join(roomID);
        io.to(roomID).emit("userJoined", { players: rooms[roomID].users.map(u => u.username), totalPoints: rooms[roomID].totalPoints  });
    });

    //
    socket.on("startQuiz", ({ roomID, duration }) => {
        if (!rooms[roomID]) return;

        rooms[roomID].remainingTime = duration;
        
        // Send initial time
        io.to(roomID).emit("timerUpdate", { remainingTime: duration });

        // Start Countdown Timer
        rooms[roomID].timer = setInterval(() => {
            if (rooms[roomID].remainingTime > 0) {
                rooms[roomID].remainingTime--;
                io.to(roomID).emit("timerUpdate", { remainingTime: rooms[roomID].remainingTime });
            } else {
                clearInterval(rooms[roomID].timer);
                io.to(roomID).emit("quizEnded", { message: "Time is up!" });
            }
        }, 1000);
    });

    // Declare a winner
    socket.on('declareWinner', ({ roomID, winnerUsername }) => {
        if (!rooms[roomID]) return socket.emit('error', "Room not found");
        if (!users[winnerUsername]) return socket.emit('error', "Winner not found");

        users[winnerUsername].points += rooms[roomID].totalPoints;
        rooms[roomID].winner = winnerUsername;

        io.to(roomID).emit('winnerAnnounced', { winnerUsername, totalPoints: rooms[roomID].totalPoints });
    });

    socket.on('disconnect', () => {
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
