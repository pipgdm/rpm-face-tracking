import 'dart:convert';
import 'dart:core';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MyApp());
}

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
  late final WebViewController _webViewController;
  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  bool _isWebViewLoaded = false;
  bool _isStreaming = false;
  String _avatarData = "{}";
  String _statusMessage = "Tap 'Start Camera' to begin";
  
  @override
  void initState() {
    super.initState();
    initRenderers();
    _setupWebView();
    _requestPermissions();
  }

  Future<void> _requestPermissions() async {
    await Permission.camera.request();
    await Permission.microphone.request();
  }

  Future<void> initRenderers() async {
    await _localRenderer.initialize();
  }

  void _setupWebView() {
    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0x00000000))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) {
            setState(() {
              _isWebViewLoaded = false;
              _statusMessage = "Loading web app...";
            });
          },
          onPageFinished: (String url) {
            setState(() {
              _isWebViewLoaded = true;
              _statusMessage = "Web app loaded. Ready to start.";
            });
            
            // Set up the communication channel for the avatar data
            _webViewController.runJavaScript('''
              window.isInWebView = true;
              
              // Function to receive the WebRTC offer from Flutter
              window.processWebRTCOffer = function(offer) {
                if (window.processRemoteOffer) {
                  window.processRemoteOffer(JSON.parse(offer));
                } else {
                  console.error("processRemoteOffer not defined in web app");
                }
              };
              
              // Set up avatar data channel back to Flutter
              if (!window.avatarDataInterval) {
                window.avatarDataInterval = setInterval(function() {
                  if (window.FlutterChannel && window.avatarData) {
                    window.FlutterChannel.postMessage(JSON.stringify(window.avatarData));
                  }
                }, 100);
              }
              
              // Let the Flutter app know we're ready
              if (window.FlutterChannel) {
                window.FlutterChannel.postMessage(JSON.stringify({
                  type: "webviewReady",
                  status: "Web app ready for WebRTC"
                }));
              }
            ''');
          },
          onWebResourceError: (WebResourceError error) {
            setState(() {
              _statusMessage = "Error loading web app: ${error.description}";
            });
          },
        ),
      )
      ..addJavaScriptChannel(
        'FlutterChannel',
        onMessageReceived: (JavaScriptMessage message) {
          try {
            final data = jsonDecode(message.message);
            
            // Handle WebRTC messages
            if (data is Map && data['type'] == 'answer') {
              _handleRemoteAnswer(data);
            } else if (data is Map && data['type'] == 'ice') {
              _handleRemoteIceCandidate(data['candidate']);
            } else if (data is Map && data['type'] == 'webviewReady') {
              setState(() {
                _statusMessage = "Ready to connect";
              });
            } else {
              // Handle avatar data
              setState(() {
                _avatarData = message.message;
              });
            }
          } catch (e) {
            print("Error processing message: $e");
          }
        },
      )
      ..loadRequest(Uri.parse('https://rpm-face-tracking-u0ph.onrender.com'));
  }

  // Start WebRTC connection
  Future<void> _startWebRTC() async {
    setState(() {
      _isStreaming = true;
      _statusMessage = "Starting camera...";
    });
    
    try {
      // Create peer connection
      Map<String, dynamic> configuration = {
        "iceServers": [
          {"urls": "stun:stun.l.google.com:19302"},
          {"urls": "stun:stun1.l.google.com:19302"},
          {"urls": "stun:stun2.l.google.com:19302"},
        ]
      };
      
      final Map<String, dynamic> offerSdpConstraints = {
        "mandatory": {
          "OfferToReceiveAudio": false,
          "OfferToReceiveVideo": false,
        },
        "optional": [],
      };
      
      // Create peer connection
      _peerConnection = await createPeerConnection(configuration);
      
      // Get user media
      final Map<String, dynamic> mediaConstraints = {
        'audio': false,
        'video': {
          'facingMode': 'user',
          'width': {'ideal': 720},
          'height': {'ideal': 1280},
        }
      };
      
      _localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      _localRenderer.srcObject = _localStream;
      
      // Add tracks to peer connection
      _localStream?.getTracks().forEach((track) {
        _peerConnection?.addTrack(track, _localStream!);
      });
      
      // Handle ICE candidates
      _peerConnection!.onIceCandidate = (RTCIceCandidate candidate) {
        if (candidate.candidate != null) {
          _sendIceCandidateToWeb(candidate);
        }
      };
      
      // Create offer
      RTCSessionDescription offer = await _peerConnection!.createOffer(offerSdpConstraints);
      await _peerConnection!.setLocalDescription(offer);
      
      // Send offer to web app
      _sendOfferToWeb(offer);
      
      setState(() {
        _statusMessage = "Camera started, connecting...";
      });
    } catch (e) {
      setState(() {
        _isStreaming = false;
        _statusMessage = "Error starting camera: $e";
      });
      print("Error starting WebRTC: $e");
    }
  }
  
  void _stopWebRTC() {
    _localStream?.getTracks().forEach((track) {
      track.stop();
    });
    _localStream?.dispose();
    _localStream = null;
    _peerConnection?.close();
    _peerConnection = null;
    
    setState(() {
      _isStreaming = false;
      _statusMessage = "Camera stopped";
    });
  }
  
  void _sendOfferToWeb(RTCSessionDescription offer) {
    final offerString = jsonEncode({
      'type': offer.type,
      'sdp': offer.sdp,
    });
    
    _webViewController.runJavaScript(
      'if (window.processWebRTCOffer) { window.processWebRTCOffer(\'$offerString\'); }'
    );
  }
  
  void _sendIceCandidateToWeb(RTCIceCandidate candidate) {
    final iceCandidate = {
      'type': 'ice',
      'candidate': candidate.toMap(),
    };
    
    _webViewController.runJavaScript(
      'if (window.processWebRTCIceCandidate) { '
      'window.processWebRTCIceCandidate(${jsonEncode(iceCandidate)}); }'
    );
  }
  
  void _handleRemoteAnswer(Map<dynamic, dynamic> answer) {
    if (_peerConnection != null) {
      _peerConnection!.setRemoteDescription(
        RTCSessionDescription(answer['sdp'], answer['type']),
      );
      setState(() {
        _statusMessage = "Connected to web app";
      });
    }
  }
  
  void _handleRemoteIceCandidate(Map<dynamic, dynamic> candidate) {
    if (_peerConnection != null && candidate != null) {
      _peerConnection!.addCandidate(
        RTCIceCandidate(
          candidate['candidate'],
          candidate['sdpMid'],
          candidate['sdpMLineIndex'],
        ),
      );
    }
  }

  @override
  void dispose() {
    _localRenderer.dispose();
    _stopWebRTC();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Face Tracking via WebRTC'),
      ),
      body: Column(
        children: [
          // Local camera preview
          Expanded(
            flex: 2,
            child: Container(
              margin: const EdgeInsets.all(8.0),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey),
                borderRadius: BorderRadius.circular(8.0),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8.0),
                child: RTCVideoView(
                  _localRenderer,
                  objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                  mirror: true,
                ),
              ),
            ),
          ),
          // WebView with the avatar
          Expanded(
            flex: 2,
            child: Stack(
              children: [
                Container(
                  margin: const EdgeInsets.all(8.0),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey),
                    borderRadius: BorderRadius.circular(8.0),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8.0),
                    child: WebViewWidget(controller: _webViewController),
                  ),
                ),
                if (!_isWebViewLoaded)
                  const Center(
                    child: CircularProgressIndicator(),
                  ),
              ],
            ),
          ),
          // Controls and status
          Container(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              children: [
                Text(
                  _statusMessage,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    ElevatedButton(
                      onPressed: _isWebViewLoaded
                          ? (_isStreaming ? _stopWebRTC : _startWebRTC)
                          : null,
                      child: Text(_isStreaming ? 'Stop Camera' : 'Start Camera'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Avatar Data:',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  height: 60,
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.black12,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: SingleChildScrollView(
                    child: Text(
                      _avatarData.length > 100
                          ? '${_avatarData.substring(0, 100)}...'
                          : _avatarData,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
