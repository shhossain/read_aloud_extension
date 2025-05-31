export interface TTSSettings {
    apiBase: string;
    voice: string;
    speed: number;
    apiKey?: string;
    model?: string;
}

export interface ExtensionState {
    active: boolean;
    tabsWithContentScripts: Set<number>;
    ttsSettings: TTSSettings;
    theme?: string;
}

export interface MessageResponse {
    active?: boolean;
    acknowledged?: boolean;
    success?: boolean;
    settings?: TTSSettings;
    theme?: string;
}