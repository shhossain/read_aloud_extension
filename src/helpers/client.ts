import { OPENAI_VOICES } from "../libs/constants";
import { VoicesResponse } from "../types/api";


export const getVoices = async (apiBase: string, apiKey?: string): Promise<VoicesResponse> => {
    try {
        const headers: Record<string, string> = {};
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }
        const response = await fetch(`${apiBase}/audio/voices`, {
            headers
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch voices: ${response.status}`);
        }
        const data: VoicesResponse = await response.json();
        return data;
    } catch (error) {
        console.log('Error fetching voices:', error);
        let voices: string[] = [];
        if (apiBase.includes("api.openai.com")) {
            voices = OPENAI_VOICES;
        }
        return {
            voices,
        }
    }
}