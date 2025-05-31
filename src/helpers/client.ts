import { OPENAI_VOICES } from "../libs/constants";
import { VoicesResponse } from "../types/api";


const _getVoices = async (apiBase: string, apiKey?: string, endpoint?: string): Promise<VoicesResponse> => {
    const headers: Record<string, string> = {};
    if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const url = endpoint ? `${apiBase}/${endpoint}` : `${apiBase}/audio/voices`;
    const response = await fetch(url, {
        headers
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
    }
    const data: VoicesResponse = await response.json();
    return data;
}


export const getVoices = async (apiBase: string, apiKey?: string, endpoint?: string): Promise<VoicesResponse> => {
    const endpoints = [
        "/audio/voices",
        "/voices"
    ];

    let data;
    for (const ep of endpoints) {
        try {
            data = await _getVoices(apiBase, apiKey, ep);
            if (data.voices && data.voices.length > 0) {
                break;
            }
        } catch (error) {
            console.error(`Error fetching voices from ${ep}:`, error);
        }
    }

    if (!data && apiBase.includes("api.openai.com")) {
    // Fallback to default voices if no data is fetched
        return {
            voices: OPENAI_VOICES,
        };
    }

    return data || { voices: [] };

};