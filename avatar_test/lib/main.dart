import 'package:flutter/foundation.dart'; // for kIsWeb
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart'; // also covers web via webview_flutter_web
import 'package:permission_handler/permission_handler.dart';


void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: AvatarScreen(),
    );
  }
}

class AvatarScreen extends StatefulWidget {
  const AvatarScreen({super.key});

  @override
  State<AvatarScreen> createState() => _AvatarScreenState();
}

class _AvatarScreenState extends State<AvatarScreen> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      _controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..addJavaScriptChannel(
          'FlutterChannel',
          onMessageReceived: (message) {
            debugPrint("Received from TSX: ${message.message}");
          },
        )
        ..loadRequest(Uri.parse('https://9087-82-132-215-23.ngrok-free.app'));
    }
  }

  Future<void> _requestCameraPermission() async {
    await Permission.camera.request();
  }

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) {
      return const Scaffold(
        body: Center(child: Text("Web platform currently not supported here")),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Avatar Viewer')),
      body: WebViewWidget(controller: _controller),
    );
  }
}
