import { TTSSettings } from "./common";

export type Theme = 'light' | 'dark';

export type State = {
    reading: boolean;
    theme: Theme;
    settings: TTSSettings;
}

export const defaultState: State = {
    reading: false,
    theme: 'light',
    settings: {
        apiBase: "https://api.example.com/v1",
        voice: "af_jessica",
        speed: 1.0
    }
};