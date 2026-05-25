import React from 'react';
import { Modal, Pressable, StyleSheet, View, Dimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { withAlpha } from '../../constants';

interface ReceiptViewerProps {
  uri: string | null;
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

/** Full-screen receipt image viewer. Pinch-to-zoom on iOS; contain-fit on Android. */
const ReceiptViewer: React.FC<ReceiptViewerProps> = ({ uri, onClose }) => {
  if (!uri) return null;
  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <Pressable onPress={onClose}>
            <Image source={{ uri }} style={styles.image} contentFit="contain" />
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: withAlpha('#000000', 0.92),
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha('#000000', 0.4),
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: width, height: height * 0.85 },
});

export default ReceiptViewer;
