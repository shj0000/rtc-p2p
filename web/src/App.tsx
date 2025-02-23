import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";

const pc_config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

const SOCKET_SERVER_URL = "https://devrtc.m-teacher.co.kr:8080";

const App = () => {
  const [roomId, setRoomId] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  // Refs for socket, peer connection, local/remote video, and local stream
  const socketRef = useRef<SocketIOClient.Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // ----------------------------
  // 1) CONNECT / JOIN ROOM
  // ----------------------------
  const handleConnect = async () => {
    if (!roomId) {
      alert("Please enter a room ID first.");
      return;
    }

    // 1. 새 socket 및 peer connection 생성
    socketRef.current = io.connect(SOCKET_SERVER_URL);
    pcRef.current = new RTCPeerConnection(pc_config);

    // 2. 소켓 이벤트 리스너
    socketRef.current.on("room_full", () => {
      // 방 인원이 가득 차서 서버에서 'room_full' 전송
      alert("해당 방은 이미 2명으로 가득 찼습니다.");
      // 바로 연결 정리 or 그냥 return
      // 여기서는 간단하게 Disconnect 로직만 실행
      // handleDisconnect();
    });

    // 기존 users 전달
    socketRef.current.on("all_users", (data: { users: any; }) => {
      const { users } = data;
      console.log("All users in this room:", users);
      if (users.length > 0) {
        // 이미 방에 유저가 있는 경우 Offer 생성
        createOffer();
      }
    });

    socketRef.current.on("getOffer", (data: { sdp: any; senderId: any; }) => {
      const { sdp, senderId } = data;
      console.log("Received offer from:", senderId);
      createAnswer(sdp);
    });

    socketRef.current.on("getAnswer", (data: { sdp: any; senderId: any; }) => {
      const { sdp, senderId } = data;
      console.log("Received answer from:", senderId);
      if (!pcRef.current) return;
      pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    socketRef.current.on("getCandidate", async (data: { candidate: any; senderId: any; }) => {
      const { candidate, senderId } = data;
      console.log("Received candidate from:", senderId);
      if (!pcRef.current) return;
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socketRef.current.on("user_exit", (data: { id: any; }) => {
      // 상대가 나갔다는 이벤트를 받았을 때 처리(선택 사항)
      console.log("User exited:", data.id);
      // remoteVideo를 비워주거나, 상태를 초기화할 수도 있음
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    });

    // 3. 미디어 세팅 & 방 참여
    try {
      await setupMediaAndJoinRoom(roomId);
      setIsConnected(true);
    } catch (err) {
      console.error(err);
    }
  };

  // ----------------------------
  // 2) DISCONNECT / LEAVE ROOM
  // ----------------------------
  const handleDisconnect = () => {
    // 서버에 leave_room 이벤트 전달
    if (socketRef.current) {
      socketRef.current.emit("leave_room", { roomId });
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // RTCPeerConnection 종료
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // 로컬 스트림 종료
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // 비디오 요소 초기화
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setIsConnected(false);
  };

  // ----------------------------
  // HELPER: Setup local media & join
  // ----------------------------
  const setupMediaAndJoinRoom = async (id: string) => {
    try {
    // --- (1) 화면 공유 API로 로컬 스트림 획득 ---
    // Chrome, Edge 등에서는 getDisplayMedia로 현재 창/탭/전체화면 중 하나를 선택할 수 있음
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: true, // 탭 오디오/시스템 오디오 공유를 허용하려면 true
      });
      localStreamRef.current = stream;

      // 로컬 비디오 출력
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // 2) RTCPeerConnection 트랙 추가
      if (pcRef.current) {
        stream.getTracks().forEach((track: MediaStreamTrack) => {
          pcRef.current?.addTrack(track, stream);
        });

        // onicecandidate
        pcRef.current.onicecandidate = (e) => {
          if (e.candidate && socketRef.current) {
            socketRef.current.emit("candidate", {
              candidate: e.candidate,
              roomId: id,
            });
          }
        };

        // ontrack
        pcRef.current.ontrack = (ev) => {
          console.log("Received remote track");
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = ev.streams[0];
          }
        };
      }

      // 3) 서버에 join_room 전송
      if (socketRef.current) {
        socketRef.current.emit("join_room", { roomId: id });
      }
    } catch (error) {
      console.error("Error getting user media:", error);
      throw error;
    }
  };

  // ----------------------------
  // HELPER: Create Offer
  // ----------------------------
  const createOffer = async () => {
    if (!pcRef.current || !socketRef.current) return;
    try {
      console.log("Creating offer...");
      const sdp = await pcRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pcRef.current.setLocalDescription(new RTCSessionDescription(sdp));
      // 서버에 offer 전달
      socketRef.current.emit("offer", { sdp, roomId });
    } catch (error) {
      console.error(error);
    }
  };

  // ----------------------------
  // HELPER: Create Answer
  // ----------------------------
  const createAnswer = async (remoteOffer: RTCSessionDescription) => {
    if (!pcRef.current || !socketRef.current) return;
    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(remoteOffer));
      console.log("Set remote description for offer.");

      const sdp = await pcRef.current.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pcRef.current.setLocalDescription(new RTCSessionDescription(sdp));

      socketRef.current.emit("answer", { sdp, roomId });
      console.log("Answer sent.");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>WebRTC Room Example (Max 2 Users)</h2>

      <div>
        <input
          type="text"
          placeholder="Enter room ID..."
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          disabled={isConnected} // 접속 중이면 방 ID 수정 불가
        />
        {!isConnected ? (
          <button onClick={handleConnect}>Connect</button>
        ) : (
          <button onClick={handleDisconnect}>Disconnect</button>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <video
          style={{ width: 240, height: 240, backgroundColor: "black" }}
          muted
          ref={localVideoRef}
          autoPlay
        />
        <video
          style={{ width: 240, height: 240, backgroundColor: "black", marginLeft: 10 }}
          ref={remoteVideoRef}
          autoPlay
        />
      </div>
    </div>
  );
};

export default App;
