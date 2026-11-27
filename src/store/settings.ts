import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings } from '../types/models';
import { saveSettingsDb } from '../lib/db';

interface SettingsState {
  settings: Settings;
  setFromDb: (settings: Settings) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  setFromDb: (settings) => set({ settings }),
  updateSettings: async (patch) => {
    const next: Settings = { ...get().settings, ...patch };
    set({ settings: next });
    await saveSettingsDb(next);
  },
}));
