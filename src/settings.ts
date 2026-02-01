import { Shortcut } from "./modal/ShortcutModal";

export interface NetClipSettings {
    viewPosition: 'left' | 'right' | 'default';
    defaultFolderName: string;
    parentFolderPath: string;
    defaultWebUrl: string;
    enableWebview: boolean;
    searchEngine: 'google' | 'youtube' | 'bing' | 'perplexity' | 'duckduckgo' | 'kagi' | 'brave';
    geminiModel: 'gemini-2.5-pro' | 'gemini-flash-latest' | 'gemini-flash-lite-latest' | 'gemini-2.5-flash-lite';
    categories: string[];
    categoryIcons: Record<string, string>;
    enableCorsProxy: boolean;
    adBlock: {
        enabled: boolean;
    }
    privateMode: boolean;
    geminiApiKey: string;
    enableAI: boolean;
    prompts: AIPrompt[];
    defaultSaveLocations: {
        defaultLocation: string;
        domainMappings: Record<string, string>;
    };
    cardDisplay: {
        showDescription: boolean;
        showAuthor: boolean;
        showDate: boolean;
        showDomain: boolean;
        showThumbnail: boolean;
    };
    replaceTabHome: boolean;
    shortcuts: Shortcut[];
    showClock: boolean;
    homeTab: {
        showRecentFiles: boolean;
        showSavedArticles: boolean;
        backgroundImage: string;
        backgroundBlur: number;
        textColor: string;
        textBrightness: number;
    };
    keepOriginalContent: boolean;
}

export interface AIPrompt {
    name: string;
    prompt: string;
    enabled: boolean;
    variables: Record<string, string[]>;
}

export const DEFAULT_SETTINGS: NetClipSettings = {
    viewPosition: 'default',
    defaultFolderName: 'NetClip',
    parentFolderPath: '',
    defaultWebUrl: 'https://google.com',
    enableWebview: true,
    searchEngine: 'google',
    geminiModel: 'gemini-2.5-pro',
    categories: [],
    categoryIcons: {},
    enableCorsProxy: false,
    adBlock: {
        enabled: true
    },
    privateMode: false,
    geminiApiKey: '',
    enableAI: false,
    prompts: [
        {
            name: "Translate Content",
            prompt: "Translate the following ${article} to ${target_lang}",
            enabled: false,
            variables: {
                "target_lang": ["Japanese", "English", "Spanish", "French", "German", "Chinese"]
            }
        },
        {
            name: "Summarize Content",
            prompt: "Summarize ${article} in ${style} style. Keep the summary ${length}.",
            enabled: false,
            variables: {
                "style": ["concise", "detailed", "bullet points", "academic"],
                "length": ["short (2-3 sentences)", "medium (1 paragraph)", "long (2-3 paragraphs)"]
            }
        },
        {
            name: "Format as Note",
            prompt: "Convert ${article} into a structured note with headings, bullet points, and key takeaways. Use ${format} formatting style.",
            enabled: false,
            variables: {
                "format": ["Academic", "Meeting Notes", "Study Notes"]
            }
        }
    ],
    defaultSaveLocations: {
        defaultLocation: '',
        domainMappings: {}
    },
    cardDisplay: {
        showDescription: true,
        showAuthor: true,
        showDate: true,
        showDomain: true,
        showThumbnail: true
    },
    replaceTabHome: false,
    shortcuts: [],
    showClock: true,
    homeTab: {
        showRecentFiles: true,
        showSavedArticles: true,
        backgroundImage: '',
        backgroundBlur: 0,
        textColor: '#ffffff',
        textBrightness: 100
    },
    keepOriginalContent: false
};