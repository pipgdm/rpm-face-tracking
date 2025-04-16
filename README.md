# Flutter + TypeScript WebRTC Face Tracking

This project demonstrates a system where:
1. A Flutter app captures video from the camera
2. Streams the video to a React TypeScript application using WebRTC
3. The TypeScript application performs face tracking using MediaPipe
4. Returns avatar animation data back to the Flutter app

## System Components

- **Flutter App**: Captures camera feed and displays avatar data
- **React TypeScript App**: Performs face tracking and generates an avatar

## Setup Instructions

### 1. Run the TypeScript App

```bash
# Install dependencies
npm install

# Start the development server
npm start
```

The React app will run on http://localhost:3000

### 2. Run the Flutter App

```bash
# Navigate to the Flutter app directory
cd avatar_test

# Get dependencies
flutter pub get

# Run the Flutter app
flutter run
```

## How It Works

1. The Flutter app initializes WebRTC and captures the camera feed
2. When you press "Connect" in the Flutter app, it:
   - Creates a WebRTC connection
   - Sends an offer to the TypeScript app
   - Establishes a bidirectional connection
3. The TypeScript app:
   - Receives the video stream via WebRTC
   - Uses MediaPipe FaceLandmarker to perform face tracking
   - Creates an avatar that mirrors facial expressions
   - Sends the tracking data back to Flutter
4. The Flutter app receives and displays the avatar data

## Troubleshooting

- Ensure both apps are running on the same network
- Check that camera permissions are granted
- If WebRTC connection fails, try restarting both apps

## Dependencies

### Flutter
- flutter_webrtc (WebRTC implementation)
- sdp_transform (SDP parsing)
- permission_handler (Camera permissions)
- webview_flutter (WebView for communication)

### TypeScript
- @mediapipe/tasks-vision (Face tracking)
- three.js / react-three-fiber (3D rendering)
