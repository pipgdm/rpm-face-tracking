import './App.css';

import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FaceLandmarkerOptions, FilesetResolver } from "@mediapipe/tasks-vision";
import { Color, Euler, Matrix4 } from 'three';
import { Canvas, useFrame, useGraph } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

let faceLandmarker: FaceLandmarker | null = null;
let lastVideoTime = -1;
let blendshapes: any[] = [];
let rotation: Euler;
let headMesh: any[] = [];

const options: FaceLandmarkerOptions = {
  baseOptions: {
    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
    delegate: "GPU"
  },
  numFaces: 1,
  runningMode: "VIDEO",
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,
};

declare global {
  interface Window {
    FlutterChannel?: {
      postMessage: (message: string) => void;
    };
    receiveOffer: (data: any) => void;
    receiveIceCandidate: (data: any) => void;
  }
}

function Avatar({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const { nodes } = useGraph(scene);

  useEffect(() => {
    if (nodes.Wolf3D_Head) headMesh.push(nodes.Wolf3D_Head);
    if (nodes.Wolf3D_Teeth) headMesh.push(nodes.Wolf3D_Teeth);
    if (nodes.Wolf3D_Beard) headMesh.push(nodes.Wolf3D_Beard);
    if (nodes.Wolf3D_Avatar) headMesh.push(nodes.Wolf3D_Avatar);
    if (nodes.Wolf3D_Head_Custom) headMesh.push(nodes.Wolf3D_Head_Custom);
  }, [nodes, url]);

  useFrame(() => {
    if (blendshapes.length > 0) {
      blendshapes.forEach(element => {
        headMesh.forEach(mesh => {
          let index = mesh.morphTargetDictionary[element.categoryName];
          if (index >= 0) {
            mesh.morphTargetInfluences[index] = element.score;
          }
        });
      });

      if (rotation && nodes.Head) {
        nodes.Head.rotation.set(rotation.x, rotation.y, rotation.z);
        if (nodes.Neck) nodes.Neck.rotation.set(rotation.x / 5 + 0.3, rotation.y / 5, rotation.z / 5);
        if (nodes.Spine2) nodes.Spine2.rotation.set(rotation.x / 10, rotation.y / 10, rotation.z / 10);
      }
    }
  });

  return <primitive object={scene} position={[0, -3.9, 1.5]} scale={2.3} />
}

function App() {
  const [url, setUrl] = useState<string>(() => {
    // Check if URL is passed in query parameters
    const params = new URLSearchParams(window.location.search);
    const avatarUrl = params.get('avatarUrl');
    return avatarUrl ? 
      `${avatarUrl}?morphTargets=ARKit&textureAtlas=1024` : 
      "https://models.readyplayer.me/6460d95f9ae10f45bffb2864.glb?morphTargets=ARKit&textureAtlas=1024";
  });
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const setupWebRTC = () => {
    window.receiveOffer = async (data) => {
      console.log('Received offer from Flutter', data);
      
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      };
      
      const pc = new RTCPeerConnection(configuration);
      setPeerConnection(pc);
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          // Send ICE candidate to Flutter
          const iceCandidate = {
            type: 'ice',
            candidate: event.candidate.toJSON(),
          };
          window.FlutterChannel?.postMessage(JSON.stringify({
            type: 'iceCandidate',
            data: iceCandidate
          }));
        }
      };

      pc.ontrack = (event) => {
        console.log('Received remote track', event.streams[0]);
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setIsConnected(true);
        }
      };

      try {
        // Parse SDP from Flutter
        const offerSdp = data.sdp;
        const sdpString = JSON.stringify(offerSdp);
        
        // Set remote description (the offer)
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: sdpString
        }));
        
        // Create answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        // Send answer to Flutter
        window.FlutterChannel?.postMessage(JSON.stringify({
          type: 'answer',
          data: pc.localDescription
        }));
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    };

    window.receiveIceCandidate = async (data) => {
      if (peerConnection && data.candidate) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    };
  };

  const setup = async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, options);

    if (videoRef.current) {
      videoRef.current.addEventListener("loadeddata", predict);
    }
  }

  const predict = async () => {
    const video = videoRef.current;
    if (!video || !faceLandmarker) return;
    
    let nowInMs = Date.now();
    if (lastVideoTime !== video.currentTime) {
      lastVideoTime = video.currentTime;
      const faceLandmarkerResult = faceLandmarker.detectForVideo(video, nowInMs);

      if (faceLandmarkerResult.faceBlendshapes && 
          faceLandmarkerResult.faceBlendshapes.length > 0 && 
          faceLandmarkerResult.faceBlendshapes[0].categories) {
        blendshapes = faceLandmarkerResult.faceBlendshapes[0].categories;

        if (faceLandmarkerResult.facialTransformationMatrixes && 
            faceLandmarkerResult.facialTransformationMatrixes.length > 0) {
          const matrix = new Matrix4().fromArray(faceLandmarkerResult.facialTransformationMatrixes[0].data);
          rotation = new Euler().setFromRotationMatrix(matrix);
          
          // Send data to Flutter
          window.FlutterChannel?.postMessage(JSON.stringify({
            blendshapes,
            rotation: {
              x: rotation.x,
              y: rotation.y,
              z: rotation.z,
            }
          }));
        }
      }
    }

    window.requestAnimationFrame(predict);
  }

  useEffect(() => {
    setup();
    setupWebRTC();
  }, []);

  return (
    <div className="App">
      <video 
        className='camera-feed' 
        id="video" 
        ref={videoRef} 
        autoPlay 
        playsInline
        style={{ display: 'none' }} // Hide the video element
      ></video>
      <Canvas 
        style={{ 
          background: 'transparent'
        }} 
        camera={{ fov: 20 }} 
        shadows
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} color={new Color(1, 1, 0)} intensity={0.5} castShadow />
        <pointLight position={[-10, 0, 10]} color={new Color(1, 0, 0)} intensity={0.5} castShadow />
        <pointLight position={[0, 0, 10]} intensity={0.5} castShadow />
        <Avatar url={url} />
      </Canvas>
      <div className="connection-status">
        WebRTC Status: {isConnected ? 'Connected' : 'Waiting for connection...'}
      </div>
    </div>
  );
}

export default App;
