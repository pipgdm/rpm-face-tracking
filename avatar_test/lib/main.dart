import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:sdp_transform/sdp_transform.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: FaceTrackingScreen(),
    );
  }
}

class FaceTrackingScreen extends StatefulWidget {
  const FaceTrackingScreen({super.key});

  @override
  State<FaceTrackingScreen> createState() => _FaceTrackingScreenState();
}

class _FaceTrackingScreenState extends State<FaceTrackingScreen> {
  final _localRenderer = RTCVideoRenderer();
  final _remoteRenderer = RTCVideoRenderer();
  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  bool _isConnected = false;
  late final WebViewController _webController;
  String _avatarData = "{}";

  @override
  void initState() {
    super.initState();
    initRenderers();
    _setupWebView();
    _requestPermissions();
  }

  void _setupWebView() {
    _webController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'FlutterChannel',
        onMessageReceived: (JavaScriptMessage message) {
          // Receive data from TypeScript app
          final data = jsonDecode(message.message);
          
          if (data['type'] == 'answer' && data['data'] != null) {
            // Process WebRTC answer
            _processRemoteAnswer(data['data']);
          } else if (data['type'] == 'iceCandidate' && data['data'] != null) {
            // Process ICE candidate
            _processRemoteIceCandidate(data['data']['candidate']);
          } else {
            // Avatar data
            setState(() {
              _avatarData = message.message;
              debugPrint("Received avatar data: $_avatarData");
            });
          }
        },
      )
      // Replace this URL with your Render deployed app URL when you have it
      ..loadRequest(Uri.parse('https://rpm-face-tracking-u0ph.onrender.com'));
  }

  Future<void> _requestPermissions() async {
    await Permission.camera.request();
    await Permission.microphone.request();
  }

  Future<void> initRenderers() async {
    await _localRenderer.initialize();
    await _remoteRenderer.initialize();
  }

  Future<void> _createPeerConnection() async {
    final Map<String, dynamic> configuration = {
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
      ]
    };

    _peerConnection = await createPeerConnection(configuration);

    // Add local stream
    _localStream = await navigator.mediaDevices.getUserMedia({
      'video': {'facingMode': 'user'},
      'audio': false,
    });
    _localStream!.getTracks().forEach((track) {
      _peerConnection!.addTrack(track, _localStream!);
    });

    _localRenderer.srcObject = _localStream;

    // Set up callbacks
    _peerConnection!.onIceCandidate = (candidate) {
      // Send ICE candidate to TypeScript app via WebView
      if (candidate.candidate != null) {
        final iceCandidate = {
          'type': 'ice',
          'candidate': candidate.toMap(),
        };
        _webController.runJavaScript(
          'receiveIceCandidate(${jsonEncode(iceCandidate)})',
        );
      }
    };

    _peerConnection!.onTrack = (RTCTrackEvent event) {
      if (event.streams.isNotEmpty) {
        _remoteRenderer.srcObject = event.streams[0];
      }
    };

    // Create offer
    RTCSessionDescription offer = await _peerConnection!.createOffer();
    await _peerConnection!.setLocalDescription(offer);

    // Convert SDP to string and send to TypeScript app
    final offerSdp = parse(offer.sdp!);
    final offerMessage = {
      'type': 'offer',
      'sdp': offerSdp,
    };

    _webController.runJavaScript(
      'receiveOffer(${jsonEncode(offerMessage)})',
    );
  }

  void _processRemoteAnswer(String sdpString) async {
    final answer = RTCSessionDescription(
      sdpString,
      'answer',
    );
    await _peerConnection?.setRemoteDescription(answer);
    setState(() {
      _isConnected = true;
    });
  }

  void _processRemoteIceCandidate(Map<String, dynamic> candidate) async {
    await _peerConnection?.addCandidate(
      RTCIceCandidate(
        candidate['candidate'],
        candidate['sdpMid'],
        candidate['sdpMLineIndex'],
      ),
    );
  }

  @override
  void dispose() {
    _localRenderer.dispose();
    _remoteRenderer.dispose();
    _localStream?.dispose();
    _peerConnection?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Face Tracking with WebRTC'),
      ),
      body: Column(
        children: [
          Expanded(
            flex: 2,
            child: Row(
              children: [
                // Local camera preview
                Expanded(
                  child: Container(
                    margin: const EdgeInsets.all(8.0),
                    decoration: BoxDecoration(border: Border.all()),
                    child: RTCVideoView(_localRenderer, mirror: true),
                  ),
                ),
                // Hidden web view for TypeScript face tracking
                Opacity(
                  opacity: 0.0,
                  child: SizedBox(
                    width: 1, 
                    height: 1,
                    child: WebViewWidget(controller: _webController),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Container(
              margin: const EdgeInsets.all(8.0),
              padding: const EdgeInsets.all(8.0),
              decoration: BoxDecoration(
                border: Border.all(),
                borderRadius: BorderRadius.circular(8.0),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Avatar Data: $_avatarData'),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      ElevatedButton(
                        onPressed: _isConnected ? null : _createPeerConnection,
                        child: Text(_isConnected ? 'Connected' : 'Connect'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
