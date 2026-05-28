import { useRef, useMemo, useLayoutEffect, useEffect } from 'react';
import { Animated, PanResponder, PanResponderInstance, useWindowDimensions, Easing, View } from 'react-native';
import { SPACING } from '../constants';

const HIDE_ZONE_ACTIVATION = 45;

interface UseEchoFabPanOptions {
  fabSide: 'left' | 'right';
  setFabSide: (side: 'left' | 'right') => void;
  setGreetingHiddenDuringDrag: (hidden: boolean) => void;
  onHide: () => void;
  insets: { top: number; bottom: number };
}

export function useEchoFabPan({
  fabSide,
  setFabSide,
  setGreetingHiddenDuringDrag,
  onHide,
  insets,
}: UseEchoFabPanOptions) {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

  const echoFabPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const hideZoneAnim = useRef(new Animated.Value(0)).current;
  const hideZoneHoverAnim = useRef(new Animated.Value(0)).current;
  const fabScale = useRef(new Animated.Value(1)).current;

  const isOverHideRef = useRef(false);
  const hideZoneRef = useRef<View>(null);
  const hideZoneScreenPos = useRef({ x: SCREEN_W / 2, y: SCREEN_H - 80 });

  const onHideRef = useRef(onHide);
  useEffect(() => { onHideRef.current = onHide; });
  const setFabSideRef = useRef(setFabSide);
  useEffect(() => { setFabSideRef.current = setFabSide; });
  const setGreetingRef = useRef(setGreetingHiddenDuringDrag);
  useEffect(() => { setGreetingRef.current = setGreetingHiddenDuringDrag; });

  const prevFabSideRef = useRef(fabSide);
  useLayoutEffect(() => {
    if (prevFabSideRef.current !== fabSide) {
      prevFabSideRef.current = fabSide;
      echoFabPan.setValue({ x: 0, y: (echoFabPan.y as any)._value });
    }
  }, [fabSide, echoFabPan]);

  const measureHideZone = () => {
    hideZoneRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) {
        hideZoneScreenPos.current = { x: x + w / 2, y: y + h / 2 };
      }
    });
  };

  const echoFabPanResponder: PanResponderInstance = useMemo(() => {
    const safeTop = Math.max(insets.top, 20);
    const defaultTop = safeTop + 80;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,

      onPanResponderGrant: () => {
        const ox = (echoFabPan.x as any)._value;
        const oy = (echoFabPan.y as any)._value;
        echoFabPan.setOffset({ x: ox, y: oy });
        echoFabPan.setValue({ x: 0, y: 0 });
        setGreetingRef.current(true);
        isOverHideRef.current = false;
        Animated.spring(hideZoneAnim, {
          toValue: 1,
          useNativeDriver: false,
          friction: 8,
          tension: 100,
        }).start(() => {
          // Measure after the zone is laid out and visible
          measureHideZone();
        });
      },

      onPanResponderMove: (_, g) => {
        echoFabPan.setValue({ x: g.dx, y: g.dy });

        const pos = hideZoneScreenPos.current;
        const dist = Math.hypot(g.moveX - pos.x, g.moveY - pos.y);
        const over = dist < HIDE_ZONE_ACTIVATION;

        if (over !== isOverHideRef.current) {
          isOverHideRef.current = over;
          Animated.spring(hideZoneHoverAnim, {
            toValue: over ? 1 : 0,
            useNativeDriver: false,
            friction: 8,
            tension: 120,
          }).start();
        }
      },

      onPanResponderRelease: (_, g) => {
        echoFabPan.flattenOffset();
        const curX = (echoFabPan.x as any)._value;
        const curY = (echoFabPan.y as any)._value;

        const pos = hideZoneScreenPos.current;
        const dist = Math.hypot(g.moveX - pos.x, g.moveY - pos.y);

        if (dist < HIDE_ZONE_ACTIVATION) {
          Animated.parallel([
            Animated.timing(fabScale, {
              toValue: 0,
              duration: 280,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(hideZoneHoverAnim, {
              toValue: 0,
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(hideZoneAnim, {
              toValue: 0,
              duration: 280,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]).start(() => {
            onHideRef.current();
            setTimeout(() => {
              echoFabPan.setValue({ x: 0, y: 0 });
              fabScale.setValue(1);
              hideZoneHoverAnim.setValue(0);
            }, 100);
          });
          setGreetingRef.current(false);
          return;
        }

        isOverHideRef.current = false;
        hideZoneHoverAnim.setValue(0);
        Animated.timing(hideZoneAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: false,
        }).start();

        const fabCX = (fabSide === 'right'
          ? SCREEN_W - SPACING.xl - 28
          : SPACING.xl + 28) + curX;
        const newSide = fabCX < SCREEN_W / 2 ? 'left' : 'right';
        const edgeSpan = SCREEN_W - 2 * SPACING.xl - 56;
        const snapX = fabSide === newSide ? 0
          : fabSide === 'right' ? -edgeSpan : edgeSpan;
        const minY = -(defaultTop - 8);
        const maxY = SCREEN_H - insets.top - 44 - insets.bottom - 80 - 56 - defaultTop;
        const clampedY = Math.max(minY, Math.min(maxY, curY));

        Animated.spring(echoFabPan, {
          toValue: { x: snapX, y: clampedY },
          useNativeDriver: false,
          friction: 14,
          tension: 100,
        }).start(() => {
          setFabSideRef.current(newSide);
          setGreetingRef.current(false);
        });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [echoFabPan, fabSide, SCREEN_W, SCREEN_H, insets.top, insets.bottom]);

  return { echoFabPan, echoFabPanResponder, hideZoneAnim, hideZoneHoverAnim, fabScale, hideZoneRef };
}
