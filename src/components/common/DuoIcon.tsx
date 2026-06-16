import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { withAlpha } from '../../constants';

// Potraces duotone glyph set — hand-drawn on a 48-grid.
// Two layers: a soft fill tint (the "duo" layer) under bold rounded strokes,
// so silhouettes survive small sizes the way thin outlines don't.
// NOTE: no string `transform` props anywhere — they render black on the new arch.

export type DuoGlyph =
  | 'wallet'
  | 'savings'
  | 'debts'
  | 'bills'
  | 'budget'
  | 'reports'
  | 'goals'
  | 'receipts'
  | 'spark'
  | 'pulse'
  | 'home'
  | 'notes'
  | 'settings'
  | 'plus'
  | 'camera'
  | 'chat'
  | 'target'
  | 'clock';

// Lets existing Feather call sites upgrade without churn:
// look the name up here; render DuoIcon on a hit, Feather otherwise.
export const FEATHER_TO_GLYPH: Record<string, DuoGlyph> = {
  'credit-card': 'wallet',
  archive: 'savings',
  'git-branch': 'debts',
  'refresh-cw': 'bills',
  sliders: 'budget',
  'trending-up': 'reports',
  flag: 'goals',
  'file-text': 'receipts',
  zap: 'spark',
  activity: 'pulse',
  home: 'home',
  'edit-3': 'notes',
  settings: 'settings',
  'plus-circle': 'plus',
  camera: 'camera',
  'message-circle': 'chat',
  target: 'target',
  clock: 'clock',
};

interface LayerProps {
  fc: string; // fill tint colour (transparent-ish when duo=false)
  sc: string; // stroke colour
  sw: number; // main stroke width (48-grid units)
}

const GLYPHS: Record<DuoGlyph, (p: LayerProps) => React.ReactElement> = {
  wallet: ({ fc, sc, sw }) => (
    <>
      <Rect x={7} y={13} width={34} height={24} rx={7} fill={fc} />
      <Rect x={7} y={13} width={34} height={24} rx={7} stroke={sc} strokeWidth={sw} />
      <Rect x={28} y={20.5} width={13} height={9} rx={4.5} fill={fc} stroke={sc} strokeWidth={sw * 0.85} />
      <Circle cx={33.5} cy={25} r={2} fill={sc} />
    </>
  ),

  // savings — coin dropping onto a coin stack
  savings: ({ fc, sc, sw }) => (
    <>
      <Rect x={12.5} y={32} width={23} height={8} rx={4} fill={fc} stroke={sc} strokeWidth={sw} />
      <Rect x={12.5} y={22.5} width={23} height={8} rx={4} fill={fc} stroke={sc} strokeWidth={sw} />
      <Circle cx={24} cy={11} r={6} fill={fc} stroke={sc} strokeWidth={sw * 0.85} />
      <Circle cx={24} cy={11} r={2} fill={sc} />
    </>
  ),

  // give & take — two ribbons passing each other
  debts: ({ fc, sc, sw }) => (
    <>
      <Rect x={8} y={13.5} width={23} height={9} rx={4.5} fill={fc} />
      <Rect x={17} y={26.5} width={23} height={9} rx={4.5} fill={fc} />
      <Path d="M10 18 H33" stroke={sc} strokeWidth={sw} strokeLinecap="round" />
      <Path d="M27.5 11.5 L34 18 L27.5 24.5" stroke={sc} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M38 31 H15" stroke={sc} strokeWidth={sw} strokeLinecap="round" />
      <Path d="M20.5 24.5 L14 31 L20.5 37.5" stroke={sc} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  // recurring — two arcs with corner-bracket heads
  bills: ({ fc, sc, sw }) => (
    <>
      <Circle cx={24} cy={24} r={15} fill={fc} />
      <Path d="M11.8 18.3 A13.5 13.5 0 0 1 36.2 18.3" stroke={sc} strokeWidth={sw} strokeLinecap="round" fill="none" />
      <Path d="M36.2 9 V18.3 H27" stroke={sc} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M36.2 29.7 A13.5 13.5 0 0 1 11.8 29.7" stroke={sc} strokeWidth={sw} strokeLinecap="round" fill="none" />
      <Path d="M11.8 39 V29.7 H21" stroke={sc} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),

  // sliders — halo under each knob
  budget: ({ fc, sc, sw }) => (
    <>
      <Circle cx={29} cy={13.5} r={6.5} fill={fc} />
      <Circle cx={17} cy={24} r={6.5} fill={fc} />
      <Circle cx={32} cy={34.5} r={6.5} fill={fc} />
      <Path d="M8 13.5 H40" stroke={sc} strokeWidth={sw * 0.85} strokeLinecap="round" />
      <Path d="M8 24 H40" stroke={sc} strokeWidth={sw * 0.85} strokeLinecap="round" />
      <Path d="M8 34.5 H40" stroke={sc} strokeWidth={sw * 0.85} strokeLinecap="round" />
      <Circle cx={29} cy={13.5} r={4} fill={sc} />
      <Circle cx={17} cy={24} r={4} fill={sc} />
      <Circle cx={32} cy={34.5} r={4} fill={sc} />
    </>
  ),

  reports: ({ fc, sc, sw }) => (
    <>
      <Path d="M8 39 V29 L19 21.5 L27 26.5 L40 13.5 V39 Z" fill={fc} />
      <Path d="M8 29 L19 21.5 L27 26.5 L40 13.5" stroke={sc} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M31.5 13.5 H40 V22" stroke={sc} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),

  // wavy banner flag
  goals: ({ fc, sc, sw }) => (
    <>
      <Path
        d="M12.5 10 C17.5 7.2 21.5 12.8 26.5 10.4 C30.5 8.5 34.5 9.3 37 11.2 V25.2 C34.5 23.3 30.5 22.5 26.5 24.4 C21.5 26.8 17.5 21.2 12.5 24 Z"
        fill={fc}
        stroke={sc}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <Path d="M12.5 42 V7" stroke={sc} strokeWidth={sw} strokeLinecap="round" />
    </>
  ),

  receipts: ({ fc, sc, sw }) => (
    <>
      <Path
        d="M12.5 7 H35.5 V36 L31.7 39.8 L27.8 36 L24 39.8 L20.2 36 L16.3 39.8 L12.5 36 Z"
        fill={fc}
        stroke={sc}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <Path d="M19 16 H29.5" stroke={sc} strokeWidth={sw * 0.75} strokeLinecap="round" />
      <Path d="M19 23 H27" stroke={sc} strokeWidth={sw * 0.75} strokeLinecap="round" />
    </>
  ),

  // bolt with a twinkle — Echo
  spark: ({ fc, sc, sw }) => (
    <>
      <Path
        d="M26.5 5.5 L13 27.5 H22.5 L21 42.5 L35 20.5 H25.5 Z"
        fill={fc}
        stroke={sc}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <Path d="M38 7.5 V13.5" stroke={sc} strokeWidth={sw * 0.7} strokeLinecap="round" />
      <Path d="M35 10.5 H41" stroke={sc} strokeWidth={sw * 0.7} strokeLinecap="round" />
    </>
  ),

  pulse: ({ fc, sc, sw }) => (
    <>
      <Circle cx={24} cy={24} r={15.5} fill={fc} />
      <Path
        d="M8 24 H15.5 L20 14 L27.5 34 L32 24 H40"
        stroke={sc}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),

  home: ({ fc, sc, sw }) => (
    <>
      <Path
        d="M8.5 21.5 L24 7.5 L39.5 21.5 V37.5 A3.5 3.5 0 0 1 36 41 H12 A3.5 3.5 0 0 1 8.5 37.5 Z"
        fill={fc}
        stroke={sc}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <Path d="M19 41 V31.5 A5 5 0 0 1 29 31.5 V41" stroke={sc} strokeWidth={sw * 0.85} strokeLinecap="round" fill="none" />
    </>
  ),

  notes: ({ fc, sc, sw }) => (
    <>
      <Path
        d="M29.5 8.5 L39.5 18.5 L19.5 38.5 L8.5 41 L11 30 Z"
        fill={fc}
        stroke={sc}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <Path d="M27 41 H41" stroke={sc} strokeWidth={sw * 0.85} strokeLinecap="round" />
    </>
  ),

  settings: ({ fc, sc, sw }) => (
    <>
      <Circle cx={24} cy={24} r={11.5} fill={fc} stroke={sc} strokeWidth={sw} />
      <Circle cx={24} cy={24} r={4.5} fill={sc} />
      <Path d="M39.5 24 H35" stroke={sc} strokeWidth={sw * 1.2} strokeLinecap="round" />
      <Path d="M8.5 24 H13" stroke={sc} strokeWidth={sw * 1.2} strokeLinecap="round" />
      <Path d="M24 39.5 V35" stroke={sc} strokeWidth={sw * 1.2} strokeLinecap="round" />
      <Path d="M24 8.5 V13" stroke={sc} strokeWidth={sw * 1.2} strokeLinecap="round" />
      <Path d="M35 35 L31.8 31.8" stroke={sc} strokeWidth={sw * 1.2} strokeLinecap="round" />
      <Path d="M13 35 L16.2 31.8" stroke={sc} strokeWidth={sw * 1.2} strokeLinecap="round" />
      <Path d="M13 13 L16.2 16.2" stroke={sc} strokeWidth={sw * 1.2} strokeLinecap="round" />
      <Path d="M35 13 L31.8 16.2" stroke={sc} strokeWidth={sw * 1.2} strokeLinecap="round" />
    </>
  ),

  plus: ({ fc, sc, sw }) => (
    <>
      <Circle cx={24} cy={24} r={16} fill={fc} stroke={sc} strokeWidth={sw} />
      <Path d="M24 16.5 V31.5" stroke={sc} strokeWidth={sw} strokeLinecap="round" />
      <Path d="M16.5 24 H31.5" stroke={sc} strokeWidth={sw} strokeLinecap="round" />
    </>
  ),

  camera: ({ fc, sc, sw }) => (
    <>
      <Rect x={6.5} y={13} width={35} height={26} rx={7} fill={fc} stroke={sc} strokeWidth={sw} />
      <Path d="M17 13 L19.5 8 H28.5 L31 13" stroke={sc} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={24} cy={25.5} r={7.5} fill={fc} stroke={sc} strokeWidth={sw * 0.85} />
      <Circle cx={35.5} cy={19} r={1.8} fill={sc} />
    </>
  ),

  chat: ({ fc, sc, sw }) => (
    <>
      <Path
        d="M24 8 C14.6 8 7 14.8 7 23.2 C7 27.9 9.4 32.1 13.2 34.9 L11.5 41.5 L18.9 38 C20.5 38.4 22.2 38.6 24 38.6 C33.4 38.6 41 31.7 41 23.2 C41 14.8 33.4 8 24 8 Z"
        fill={fc}
        stroke={sc}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <Circle cx={17.5} cy={23.5} r={2} fill={sc} />
      <Circle cx={24} cy={23.5} r={2} fill={sc} />
      <Circle cx={30.5} cy={23.5} r={2} fill={sc} />
    </>
  ),

  target: ({ fc, sc, sw }) => (
    <>
      <Circle cx={24} cy={24} r={15.5} fill={fc} stroke={sc} strokeWidth={sw} />
      <Circle cx={24} cy={24} r={8.5} stroke={sc} strokeWidth={sw * 0.85} fill="none" />
      <Circle cx={24} cy={24} r={2.5} fill={sc} />
    </>
  ),

  clock: ({ fc, sc, sw }) => (
    <>
      <Circle cx={24} cy={24} r={15.5} fill={fc} stroke={sc} strokeWidth={sw} />
      <Path d="M24 15 V24 L30.5 28" stroke={sc} strokeWidth={sw * 0.85} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
};

interface DuoIconProps {
  glyph: DuoGlyph;
  color: string;
  size?: number;
  /** false = outline only (e.g. inactive tab) */
  duo?: boolean;
  /** opacity of the fill layer */
  fillAlpha?: number;
  strokeWidth?: number;
}

const DuoIcon: React.FC<DuoIconProps> = ({
  glyph,
  color,
  size = 26,
  duo = true,
  fillAlpha = 0.26,
  strokeWidth = 4,
}) => {
  const fc = duo ? withAlpha(color, fillAlpha) : 'none';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {GLYPHS[glyph]({ fc, sc: color, sw: strokeWidth })}
    </Svg>
  );
};

export default DuoIcon;
