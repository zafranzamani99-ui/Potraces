import React, { useCallback, useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RootSiblings from 'react-native-root-siblings';
import RewardModal, { type RewardModalProps, type NewReward } from '../components/common/RewardModal';

export type { RewardModalProps, NewReward };

// --- Global reward-modal host registry (same pattern as ToastContext) ---
// Services (entitlements) are outside the React tree, so a module-level
// function lets them pop the floating modal from anywhere.

let _show: ((props: RewardModalProps) => void) | null = null;
let _earnedShown = false; // module lifetime ≈ one app launch

/** Show the floating reward modal. No-op before RewardModalProvider mounts. */
export function globalShowRewardModal(props: RewardModalProps): void {
  if (props.kind === 'earned') _earnedShown = true;
  if (_show) _show(props);
}

/** True when an 'earned' modal already fired this launch — the once-per-install
 *  intro modal skips so the two never stack (intro waits for the next launch). */
export function earnedModalShownThisLaunch(): boolean {
  return _earnedShown;
}

export const RewardModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const siblingRef = useRef<RootSiblings | null>(null);

  const hide = useCallback(() => {
    if (siblingRef.current) {
      siblingRef.current.destroy();
      siblingRef.current = null;
    }
  }, []);

  const show = useCallback(
    (props: RewardModalProps) => {
      if (siblingRef.current) {
        siblingRef.current.destroy();
        siblingRef.current = null;
      }
      siblingRef.current = new RootSiblings(
        <GestureHandlerRootView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, pointerEvents: 'box-none' }}
        >
          <RewardModal {...props} onClose={hide} />
        </GestureHandlerRootView>
      );
    },
    [hide]
  );

  useEffect(() => {
    _show = show;
    return () => {
      _show = null;
      if (siblingRef.current) siblingRef.current.destroy();
    };
  }, [show]);

  return <>{children}</>;
};

export default RewardModalProvider;
