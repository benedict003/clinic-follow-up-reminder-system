// lib/app_routes.dart
//
// Named routes. On Flutter Web every entry here becomes a browser history
// entry (`http://localhost:8080/#/secure-exchange`), so Chrome's back and
// forward buttons move the app one screen at a time and always land on a
// screen that exists.
//
// Before this, every page was pushed as an anonymous MaterialPageRoute, so the
// URL never changed, the browser's history and the Navigator's stack could
// drift apart, and pressing back could strand the tab on a document that was
// no longer the running app - a white page where nothing responds.
class AppRoutes {
  const AppRoutes._();

  /// The signed-in shell or the login screen. Owned by `home:` in main.dart
  /// because it depends on session state.
  static const String root = '/';

  /// Base URL picker reachable from the login screen, before a session exists.
  static const String serverSetup = '/server';

  /// Server & session, reached from More.
  static const String settings = '/settings';

  /// Module 14: preview, seal and send a minimised record.
  static const String secureExchange = '/secure-exchange';

  /// One follow-up record. Takes the id as the route argument.
  static const String followUp = '/follow-up';
}
