import type { State } from './state';
import type { StateManager } from '../modules/state';

// Add global type declarations
declare global {
    interface Window {
        globalAudio: HTMLAudioElement | null;
        state: State;
        stateManager: StateManager;
    }
}