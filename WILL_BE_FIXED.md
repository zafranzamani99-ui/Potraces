# Will Be Fixed

## Contact Picker Keyboard Issue (Customers Screen)
- **Screen**: `src/screens/seller/Customers.tsx` — "pick contact" modal
- **Problem**: When typing in the contact search field, the keyboard covers the search results list. Tried `KeyboardAvoidingView` with `behavior="padding"`, `"height"`, and relying on `adjustResize` — none work correctly:
  - `behavior="padding"` → white gap when keyboard closes
  - `behavior="height"` → list still shrinks/hidden
  - `adjustResize` alone → list shrinks behind keyboard (transparent Modal may not respect adjustResize since it creates its own Android window)
- **Root cause**: Android transparent Modal creates a separate window that doesn't inherit `softwareKeyboardLayoutMode: "adjustResize"` from app.json. KeyboardAvoidingView double-compensates or doesn't work reliably.
- **Possible solutions**:
  1. Replace FlatList-in-modal with a full-screen navigation push (avoids modal keyboard issues entirely)
  2. Use `react-native-keyboard-controller`'s `KeyboardAwareScrollView` wrapping the entire modal content
  3. Use `react-native-modal` (community lib) which handles Android keyboard better
  4. Listen to keyboard events manually and adjust sheet position with Animated
