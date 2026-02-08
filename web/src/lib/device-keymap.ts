// Maps browser event.code to Android AKEYCODE_* values
// Reference: https://developer.android.com/reference/android/view/KeyEvent

export const keycodeMap: Record<string, number> = {
  // Letters
  KeyA: 29,
  KeyB: 30,
  KeyC: 31,
  KeyD: 32,
  KeyE: 33,
  KeyF: 34,
  KeyG: 35,
  KeyH: 36,
  KeyI: 37,
  KeyJ: 38,
  KeyK: 39,
  KeyL: 40,
  KeyM: 41,
  KeyN: 42,
  KeyO: 43,
  KeyP: 44,
  KeyQ: 45,
  KeyR: 46,
  KeyS: 47,
  KeyT: 48,
  KeyU: 49,
  KeyV: 50,
  KeyW: 51,
  KeyX: 52,
  KeyY: 53,
  KeyZ: 54,

  // Numbers
  Digit0: 7,
  Digit1: 8,
  Digit2: 9,
  Digit3: 10,
  Digit4: 11,
  Digit5: 12,
  Digit6: 13,
  Digit7: 14,
  Digit8: 15,
  Digit9: 16,

  // Control keys
  Enter: 66,
  Backspace: 67,
  Delete: 112,
  Tab: 61,
  Space: 62,
  Escape: 111,

  // Arrow keys
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,

  // Modifiers
  ShiftLeft: 59,
  ShiftRight: 60,
  ControlLeft: 113,
  ControlRight: 114,
  AltLeft: 57,
  AltRight: 58,

  // Function keys
  F1: 131,
  F2: 132,
  F3: 133,
  F4: 134,
  F5: 135,
  F6: 136,
  F7: 137,
  F8: 138,
  F9: 139,
  F10: 140,
  F11: 141,
  F12: 142,

  // Symbols
  Minus: 69,
  Equal: 70,
  BracketLeft: 71,
  BracketRight: 72,
  Backslash: 73,
  Semicolon: 74,
  Quote: 75,
  Backquote: 68,
  Comma: 55,
  Period: 56,
  Slash: 76,

  // Special
  Home: 3,    // KEYCODE_HOME
  End: 123,   // KEYCODE_MOVE_END
  PageUp: 92,
  PageDown: 93,

  // Android specific
  // Volume
  AudioVolumeUp: 24,
  AudioVolumeDown: 25,
  AudioVolumeMute: 164,

  // Media
  MediaPlayPause: 85,
  MediaStop: 86,
  MediaTrackNext: 87,
  MediaTrackPrevious: 88,
};
