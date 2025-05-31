import { defaultState, type State } from "../types/state";

type StateChangeListener = (prop: keyof State, newValue: any, oldValue: any) => void;
type KeySpecificListener<K extends keyof State> = (newValue: State[K], oldValue: State[K]) => void;

export class StateManager {
    private listeners: StateChangeListener[] = [];
    private keyListeners: Map<keyof State, KeySpecificListener<any>[]> = new Map();

    addListener(listener: StateChangeListener): () => void {
        this.listeners.push(listener);
        // Return a function to remove this listener
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index !== -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    addKeyListener<K extends keyof State>(key: K, listener: KeySpecificListener<K>): () => void {
        if (!this.keyListeners.has(key)) {
            this.keyListeners.set(key, []);
        }

        const listeners = this.keyListeners.get(key)!;
        listeners.push(listener as KeySpecificListener<any>);

        // Return function to remove this listener
        return () => {
            const keyListeners = this.keyListeners.get(key);
            if (keyListeners) {
                const index = keyListeners.indexOf(listener as KeySpecificListener<any>);
                if (index !== -1) {
                    keyListeners.splice(index, 1);
                }
            }
        };
    }

    emit(prop: keyof State, newValue: any, oldValue: any): void {
        this.listeners.forEach(listener => listener(prop, newValue, oldValue));

        const keyListeners = this.keyListeners.get(prop);
        if (keyListeners && keyListeners.length > 0) {
            keyListeners.forEach(listener => listener(newValue, oldValue));
        }
    }
}

const getStateManager = () => {
    if (!window.stateManager) {
        window.stateManager = new StateManager();
    }
    return window.stateManager;
}

const stateManager = getStateManager();



const handler = {
    get(target: State, prop: keyof State) {
        window.state = window.state || defaultState;

        return window.state[prop];
    },

    set(target: State, prop: keyof State, value: any) {
        window.state = window.state || defaultState;
        if (!window.state) return false;

        const oldValue = window.state[prop];

        // Only emit if value actually changed
        if (oldValue !== value) {
            console.log(`Assigning ${prop} = ${value}`);
            // @ts-ignore
            window.state[prop] = value;
            stateManager.emit(prop, value, oldValue);
        } else {
            // @ts-ignore
            window.state[prop] = value;
        }

        return true;
    }
};

export const state = new Proxy(defaultState, handler);

// Add the state manager to the exported object for external use
export const subscribe = (listener: StateChangeListener) => stateManager.addListener(listener);

export const subscribeToKey = <K extends keyof State>(
    key: K,
    listener: (newValue: State[K], oldValue: State[K]) => void
) => stateManager.addKeyListener(key, listener);