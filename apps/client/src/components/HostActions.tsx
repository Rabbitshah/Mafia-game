import { createContext, useContext } from 'react';

export interface HostActions {
  skip: () => Promise<string | null>;
  pause: () => Promise<string | null>;
}

/** Lets the host buttons sit on any screen without threading props through every one. */
export const HostActionsContext = createContext<HostActions | null>(null);
export const useHostActions = () => useContext(HostActionsContext);
