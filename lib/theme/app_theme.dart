// lib/theme/app_theme.dart
import 'package:flutter/material.dart';

class Palette {
  const Palette._();
  static const teal = Color(0xFF0F6E62);
  static const tealDeep = Color(0xFF083F38);
  static const paper = Color(0xFFF6F8F7);
  static const ink = Color(0xFF16211F);
  static const accent = Color(0xFF2E9E7E);
}

class AppTheme {
  const AppTheme._();
  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: Palette.teal,
      primary: Palette.teal,
      secondary: Palette.accent,
      surface: Palette.paper,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: Palette.paper,
      appBarTheme: const AppBarTheme(
        backgroundColor: Palette.teal,
        foregroundColor: Colors.white,
        elevation: 0,
        titleTextStyle: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
      ),
      // Size.fromHeight(48) means minWidth = infinity: the button stretches to
      // its parent's width. That is intended in a Column, but inside a Row the
      // width is unbounded and layout throws "BoxConstraints forces an infinite
      // width". Any of these buttons placed in a Row must override minimumSize
      // (see the Preview button in secure_exchange_screen.dart).
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(46),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    );
  }
}