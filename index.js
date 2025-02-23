// index.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const socketio = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// 1) Express CORS 설정 (HTTP 요청에 대해 전부 허용)
app.use(
    cors({
      origin: "*",       // 모든 origin 허용
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    })
);

const PORT = process.env.PORT || 8080;

// 방에 접속해 있는 사용자 목록
// 예: { roomId: [{ id: 소켓ID }, ...], ... }
let users = {};

// 소켓ID -> roomId 매핑 (사용자가 여러 방에 들어갈 수 있으면, 여러 매핑이 필요하지만
// 여기서는 1:1 매핑 예시. 만약 유저가 여러 방을 동시에 들어갈 수 있다면 구조를 바꿔야 함)
let socketToRoom = {};

const MAXIMUM = 2; // 방 최대 인원 (2명)

io.on("connection", (socket) => {
  /**
   * 방 접속
   */
  socket.on("join_room", (data) => {
    const roomId = data.roomId;

    if (users[roomId]) {
      const length = users[roomId].length;
      // 이미 2명이면 추가 접속 불가
      if (length >= MAXIMUM) {
        socket.emit("room_full");
        return;
      }

      users[roomId].push({ id: socket.id });
    } else {
      // 방이 없으면 새 배열 생성
      users[roomId] = [{ id: socket.id }];
    }

    // 방 입장 처리
    socketToRoom[socket.id] = roomId;
    socket.join(roomId);

    console.log(`[${roomId}]: ${socket.id} enter`);

    // 이미 방에 있던 사용자 목록을 새로 들어온 소켓에게 전달
    const usersInThisRoom = users[roomId].filter((user) => user.id !== socket.id);
    socket.emit("all_users", { roomId, users: usersInThisRoom });
  });

  /**
   * offer
   */
  socket.on("offer", (data) => {
    // data: { sdp, roomId, receiverId? }
    console.log("offer from:", socket.id, " room:", data.roomId);
    // 특정 상대에게만 보낼 수도 있고, 같은 방 전체에게 방송할 수도 있음
    // 여기서는 단순히 같은 방 사용자에게 방송 (본인 제외)
    socket.to(data.roomId).emit("getOffer", {
      sdp: data.sdp,
      senderId: socket.id,
    });
  });

  /**
   * answer
   */
  socket.on("answer", (data) => {
    // data: { sdp, roomId, receiverId? }
    console.log("answer from:", socket.id, " room:", data.roomId);
    // 특정 상대에게만 보낼 수도 있음
    socket.to(data.roomId).emit("getAnswer", {
      sdp: data.sdp,
      senderId: socket.id,
    });
  });

  /**
   * candidate
   */
  socket.on("candidate", (data) => {
    // data: { candidate, roomId, receiverId? }
    console.log("candidate from:", socket.id, " room:", data.roomId);
    socket.to(data.roomId).emit("getCandidate", {
      candidate: data.candidate,
      senderId: socket.id,
    });
  });

  /**
   * 방 퇴장
   */
  socket.on("leave_room", (data) => {
    // data: { roomId }
    const roomId = data.roomId;
    console.log(`[${roomId}]: ${socket.id} leave_room`);
    socket.leave(roomId);

    // users 목록에서 제거
    if (users[roomId]) {
      users[roomId] = users[roomId].filter((user) => user.id !== socket.id);
      if (users[roomId].length === 0) {
        delete users[roomId];
      } else {
        // 떠난 사람 정보 broadcast
        socket.to(roomId).emit("user_exit", { id: socket.id });
      }
    }

    delete socketToRoom[socket.id];
  });

  /**
   * 소켓 끊길 때
   */
  socket.on("disconnect", () => {
    const roomId = socketToRoom[socket.id];
    console.log(`[${roomId}]: ${socket.id} disconnect`);

    if (roomId && users[roomId]) {
      users[roomId] = users[roomId].filter((user) => user.id !== socket.id);
      if (users[roomId].length === 0) {
        delete users[roomId];
      } else {
        socket.to(roomId).emit("user_exit", { id: socket.id });
      }
    }
    delete socketToRoom[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
