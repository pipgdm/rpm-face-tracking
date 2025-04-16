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

### Option 1: Local Development

#### 1. Run the TypeScript App

```bash
# Install dependencies
npm install

# Start the development server
npm start
```

The React app will run on http://localhost:3000

#### 2. Run the Flutter App

```bash
# Navigate to the Flutter app directory
cd avatar_test

# Get dependencies
flutter pub get

# Run the Flutter app
flutter run
```

### Option 2: Deploy TypeScript App to Render.com

1. Create a Render.com account at https://render.com/
2. From your dashboard, select "New Web Service"
3. Connect to your GitHub repository
4. Configure the service:
   - Name: `face-tracking-app` (or your preferred name)
   - Environment: `Static Site`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `build`
5. Click "Create Web Service"
6. Wait for the deploy to complete (typically 1-2 minutes)
7. Note the URL of your deployed app (e.g., `https://face-tracking-app.onrender.com`)
8. Update the URL in your Flutter app:
   - Open `avatar_test/lib/main.dart`
   - Find the line with `.loadRequest(Uri.parse('https://your-render-app-name.onrender.com'))`
   - Replace the URL with your actual Render.com URL

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

- Ensure both apps are running on the same network (if using local development)
- Check that camera permissions are granted
- If WebRTC connection fails when using local development, try deploying to Render.com
- To verify your Render deployment is working, check `https://your-render-app-name.onrender.com/status.json`

## Dependencies

### Flutter
- flutter_webrtc (WebRTC implementation)
- sdp_transform (SDP parsing)
- permission_handler (Camera permissions)
- webview_flutter (WebView for communication)

### TypeScript
- @mediapipe/tasks-vision (Face tracking)
- three.js / react-three-fiber (3D rendering)
