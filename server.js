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

const questions = [
    { question: "What is 2 + 2?", options: ["3", "4", "5", "6"], answer: "4" },
    { question: "Which is the capital of France?", options: ["Berlin", "Madrid", "Paris", "Lisbon"], answer: "Paris" },
    { question: "What is the square root of 64?", options: ["6", "8", "10", "12"], answer: "8" }
];

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
            const roomID = Math.random().toString(36).substr(2, 6);
        rooms[roomID] = { 
            users: [{ id: socket.id, username }], 
            host: socket.id, 
            questions, 
            currentQuestion: 0, 
            scores: {} 
        };
        rooms[roomID].scores[username] = 0;  // Initialize score
        socket.join(roomID);
        socket.emit("roomCreated", { roomID, inviteLink: `http://localhost:3000/?room=${roomID}` });
        console.log(`${username} created room ${roomID}`);
        });

    // User joins a quiz room
    socket.on("joinRoom", ({ username, roomID }) => {
        if (!rooms[roomID]) return socket.emit("error", "Room not found");
        rooms[roomID].users.push({ id: socket.id, username });
        rooms[roomID].scores[username] = 0;
        socket.join(roomID);
        io.to(roomID).emit("userJoined", { players: rooms[roomID].users.map(u => u.username) });
        console.log(`${username} joined room ${roomID}`);
    });

    //
    socket.on("startQuiz", ({ roomID }) => {
        if (!rooms[roomID]) return;
        io.to(roomID).emit("quizStarted");
        sendQuestion(roomID);
    });

    // Function to Send Question
    function sendQuestion(roomID) {
        const room = rooms[roomID];
        if (!room) {
            console.error(`Room ${roomID} not found!`);
            return;
        }
    
        if (!room || room.currentQuestion >= room.questions.length) {
            console.log(`No more questions for room ${roomID}`);
            io.to(roomID).emit("quizEnded", { message: "Quiz Over!", scores: room.scores });
            return;
        }

        const question = room.questions[room.currentQuestion];
        io.to(roomID).emit("newQuestion", { question, questionNumber: room.currentQuestion + 1 });

        room.timer = setTimeout(() => {
            io.to(roomID).emit("questionTimeout", { message: "Time's up!" });
            room.currentQuestion++;
            sendQuestion(roomID);
        }, 10000);  // 10s timer per question
    }
    
    socket.on("submitAnswer", ({ roomID, username, answer }) => {
        const room = rooms[roomID];
        if (!room) return;

        const currentQuestion = room.questions[room.currentQuestion];
        if (currentQuestion.answer === answer) {
            room.scores[username] += 10;  // Correct answer adds points
        }

        console.log(`${username} answered: ${answer}, Correct: ${currentQuestion.answer}`);
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
