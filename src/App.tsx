import './App.css';

import { useEffect, useRef, useState, useCallback } from 'react';
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
    isInWebView: boolean;
    avatarData: any;
    processExternalFrame?: (frameData: any) => void;
    setupExternalCameraMode?: () => void;
    processWebRTCOffer?: (offer: string) => void;
    processWebRTCIceCandidate?: (candidate: any) => void;
    processRemoteOffer?: (offer: any) => void;
    cameraStream?: MediaStream;
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
  const [isWebRTCInitialized, setIsWebRTCInitialized] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Initializing...");

  // Setup WebRTC for receiving video from Flutter
  const setupWebRTCReceiver = useCallback(() => {
    if (isWebRTCInitialized) return;
    
    // Function to process an offer from Flutter
    window.processRemoteOffer = async (offer) => {
      console.log('Processing WebRTC offer from Flutter:', offer);
      setStatusMessage("Received WebRTC offer from Flutter");
      
      try {
        // Create RTCPeerConnection
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
        
        // Handle incoming ICE candidates
        window.processWebRTCIceCandidate = (data) => {
          console.log('Processing ICE candidate from Flutter:', data);
          if (pc && data && data.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(data.candidate))
              .catch(e => console.error('Error adding ICE candidate:', e));
          }
        };
        
        // Send ICE candidates to Flutter
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('Sending ICE candidate to Flutter:', event.candidate);
            window.FlutterChannel?.postMessage(JSON.stringify({
              type: 'ice',
              candidate: event.candidate.toJSON()
            }));
          }
        };
        
        // Handle connection state changes
        pc.onconnectionstatechange = () => {
          console.log('WebRTC connection state:', pc.connectionState);
          setStatusMessage(`WebRTC: ${pc.connectionState}`);
          
          if (pc.connectionState === 'connected') {
            setIsConnected(true);
          } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
            setIsConnected(false);
          }
        };
        
        // Handle incoming tracks
        pc.ontrack = (event) => {
          console.log('Received track from Flutter:', event);
          if (event.streams && event.streams[0]) {
            window.cameraStream = event.streams[0];
            
            if (videoRef.current) {
              videoRef.current.srcObject = event.streams[0];
              console.log('Video element updated with remote stream');
              setStatusMessage("Receiving video from Flutter");
            }
          }
        };
        
        // Set the remote description (offer from Flutter)
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('Remote description set');
        
        // Create answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('Local description set, sending answer to Flutter');
        
        // Send answer to Flutter
        window.FlutterChannel?.postMessage(JSON.stringify({
          type: 'answer',
          sdp: pc.localDescription?.sdp,
          sdpType: pc.localDescription?.type
        }));
        
        setIsWebRTCInitialized(true);
      } catch (error) {
        console.error('Error setting up WebRTC:', error);
        setStatusMessage(`WebRTC Error: ${error}`);
      }
    };
    
    // Notify that we're ready to receive WebRTC connections
    if (window.FlutterChannel) {
      window.FlutterChannel.postMessage(JSON.stringify({
        type: 'webviewReady',
        status: 'Ready for WebRTC'
      }));
    }
  }, [isWebRTCInitialized]);

  // Set up MediaPipe face tracking
  const setup = async () => {
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
      faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, options);
      setStatusMessage("MediaPipe initialized");
      
      if (videoRef.current) {
        videoRef.current.addEventListener("loadeddata", predict);
      }
    } catch (error) {
      console.error('Error setting up MediaPipe:', error);
      setStatusMessage(`MediaPipe Error: ${error}`);
    }
  }

  // Face tracking prediction function
  const predict = async () => {
    const video = videoRef.current;
    if (!video || !faceLandmarker) return;
    
    let nowInMs = Date.now();
    if (lastVideoTime !== video.currentTime) {
      lastVideoTime = video.currentTime;
      try {
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
            window.avatarData = {
              blendshapes,
              rotation: {
                x: rotation.x,
                y: rotation.y,
                z: rotation.z,
              }
            };
          }
        }
      } catch (error) {
        console.error('Error during prediction:', error);
      }
    }

    window.requestAnimationFrame(predict);
  }

  useEffect(() => {
    setup();
    setupWebRTCReceiver();
    
    return () => {
      if (peerConnection) {
        peerConnection.close();
      }
      // Use type assertion to avoid TypeScript errors
      (window as any).processRemoteOffer = undefined;
      (window as any).processWebRTCIceCandidate = undefined;
    };
  }, [setupWebRTCReceiver]);

  return (
    <div className="App">
      <video 
        className='camera-feed' 
        id="video" 
        ref={videoRef} 
        autoPlay 
        playsInline
        muted
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
        {statusMessage} {isConnected ? '(Connected)' : '(Waiting)'}
      </div>
    </div>
  );
}

export default App;
