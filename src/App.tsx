import './App.css';

import { useEffect, useState } from 'react';
import { FaceLandmarker, FaceLandmarkerOptions, FilesetResolver } from "@mediapipe/tasks-vision";
import { Color, Euler, Matrix4 } from 'three';
import { Canvas, useFrame, useGraph } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useDropzone } from 'react-dropzone';

let video: HTMLVideoElement;
let faceLandmarker: FaceLandmarker;
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

      nodes.Head.rotation.set(rotation.x, rotation.y, rotation.z);
      nodes.Neck.rotation.set(rotation.x / 5 + 0.3, rotation.y / 5, rotation.z / 5);
      nodes.Spine2.rotation.set(rotation.x / 10, rotation.y / 10, rotation.z / 10);
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
  
  const { getRootProps } = useDropzone({
    onDrop: files => {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setUrl(reader.result as string);
      }
      reader.readAsDataURL(file);
    }
  });

  const setup = async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, options);

    video = document.getElementById("video") as HTMLVideoElement;
    navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: false,
    }).then(function (stream) {
      video.srcObject = stream;
      video.addEventListener("loadeddata", predict);
    });
  }

  const predict = async () => {
    let nowInMs = Date.now();
    if (lastVideoTime !== video.currentTime) {
      lastVideoTime = video.currentTime;
      const faceLandmarkerResult = faceLandmarker.detectForVideo(video, nowInMs);

      if (faceLandmarkerResult.faceBlendshapes && faceLandmarkerResult.faceBlendshapes.length > 0 && faceLandmarkerResult.faceBlendshapes[0].categories) {
        blendshapes = faceLandmarkerResult.faceBlendshapes[0].categories;

        const matrix = new Matrix4().fromArray(faceLandmarkerResult.facialTransformationMatrixes![0].data);
        rotation = new Euler().setFromRotationMatrix(matrix);
      }
    }

    window.requestAnimationFrame(predict);
  }

  useEffect(() => {
    setup();

    const sendToFlutter = () => {
      const data = {
        blendshapes,
        rotation: {
          x: rotation?.x || 0,
          y: rotation?.y || 0,
          z: rotation?.z || 0,
        }
      };
      window.FlutterChannel?.postMessage(JSON.stringify(data));
    };
  
    const interval = setInterval(sendToFlutter, 100); // Send every 100ms
    return () => clearInterval(interval);
  }, [blendshapes, rotation]);

  return (
    <div className="App">
      <video className='camera-feed' id="video" autoPlay></video>
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
    </div>
  );
}

export default App;
