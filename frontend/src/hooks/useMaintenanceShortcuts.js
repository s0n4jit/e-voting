import { useEffect } from 'react';

/**
 * Custom hook to intercept staff-only maintenance shortcuts in Kiosk mode
 *
 * Shortcuts:
 *   Ctrl + Alt + Shift + M -> Open maintenance panel
 *   Ctrl + Alt + Shift + N -> Network diagnostics tab
 *   Ctrl + Alt + Shift + R -> Restart booth prompt
 *   Ctrl + Alt + Shift + L -> Return to voting kiosk
 *   Ctrl + Alt + Shift + T -> Run system health checks
 */
export const useMaintenanceShortcuts = ({
  onOpenMaintenance,
  onCloseMaintenance,
  onSwitchTab,
  isMaintenanceOpen,
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Must match Ctrl + Alt + Shift together
      if (e.ctrlKey && e.altKey && e.shiftKey) {
        const key = e.key.toUpperCase();

        if (key === 'M') {
          e.preventDefault();
          onOpenMaintenance?.('overview');
        } else if (key === 'N') {
          e.preventDefault();
          onOpenMaintenance?.('network');
        } else if (key === 'R') {
          e.preventDefault();
          onOpenMaintenance?.('actions');
        } else if (key === 'L') {
          e.preventDefault();
          onCloseMaintenance?.();
        } else if (key === 'T') {
          e.preventDefault();
          onOpenMaintenance?.('network');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenMaintenance, onCloseMaintenance, onSwitchTab, isMaintenanceOpen]);
};

export default useMaintenanceShortcuts;
