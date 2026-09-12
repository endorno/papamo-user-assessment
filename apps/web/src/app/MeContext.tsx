import { createContext, useContext, type ReactNode } from 'react';

import type { MeResponse } from '@papamo/shared';

interface MeContextValue {
  me: MeResponse | null;
  setMe: (me: MeResponse) => void;
}

const MeContext = createContext<MeContextValue | undefined>(undefined);

export function MeProvider({
  me,
  setMe,
  children,
}: {
  me: MeResponse | null;
  setMe: (me: MeResponse) => void;
  children: ReactNode;
}) {
  return <MeContext.Provider value={{ me, setMe }}>{children}</MeContext.Provider>;
}

// コーチ情報はレイアウトで1回だけ取得する。画面ごとに /me を叩かない。
export function useMe(): MeContextValue {
  const context = useContext(MeContext);
  if (!context) {
    throw new Error('useMe は MeProvider の内側で使ってください。');
  }
  return context;
}
