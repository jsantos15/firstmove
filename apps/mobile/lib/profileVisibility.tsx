import { createContext, useContext, useState, type ReactNode } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

interface ProfileVisibilityCtx {
  visible: boolean;
  setVisible: (v: boolean) => void;
}

const ProfileVisibilityContext = createContext<ProfileVisibilityCtx>({
  visible: true,
  setVisible: () => {},
});

export function ProfileVisibilityProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  return (
    <ProfileVisibilityContext.Provider value={{ visible, setVisible }}>
      {children}
    </ProfileVisibilityContext.Provider>
  );
}

export function useProfileVisible() {
  return useContext(ProfileVisibilityContext).visible;
}

/** Call in any screen that should hide the floating profile button while focused. */
export function useHideProfileButton() {
  const { setVisible } = useContext(ProfileVisibilityContext);
  useFocusEffect(
    useCallback(() => {
      setVisible(false);
      return () => setVisible(true);
    }, [setVisible])
  );
}
