import React, { useEffect, useRef, useState } from 'react';
import { Text, TextProps } from 'react-native';

interface Props extends TextProps {
  text: string;
  speed?: number;        // ms per character
  startDelay?: number;   // ms before typing starts
  onDone?: () => void;
}

const TypewriterText: React.FC<Props> = ({
  text,
  speed = 28,
  startDelay = 120,
  onDone,
  ...rest
}) => {
  const [shown, setShown] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setShown('');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (!text) return;

    timeoutRef.current = setTimeout(() => {
      let i = 0;
      intervalRef.current = setInterval(() => {
        i += 1;
        setShown(text.slice(0, i));
        if (i >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onDone?.();
        }
      }, speed);
    }, startDelay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, speed, startDelay]);

  return <Text {...rest}>{shown}</Text>;
};

export default TypewriterText;
