import { baseSearchUrls } from './searchUrls';
import { fetchSuggestions } from './fetchSuggestions';

export interface WebSearchSettings {
    searchEngine?: 'google' | 'youtube' | 'bing' | 'perplexity' | 'duckduckgo' | 'kagi' | 'brave';
}

export class WebSearch {

    private searchInput: HTMLInputElement;
    private suggestionsBox: HTMLElement;
    private suggestionContainer: HTMLElement;
    private currentSuggestionIndex: number = -1;
    private settings: WebSearchSettings;
    private isVisible: boolean = false;


    private baseSearchUrls: Record<string, string> = baseSearchUrls;

    // Store bound event listeners
    private handleInput: (event: Event) => void;
    private handleKeydown: (event: KeyboardEvent) => void;
    private handleBlur: (event: FocusEvent) => void;
    private handleWindowClick: (event: MouseEvent) => void;

    constructor(
        searchInput: HTMLInputElement,
        suggestionContainer: HTMLElement,
        suggestionsBox: HTMLElement,
        settings: WebSearchSettings = {}
    ) {
        this.searchInput = searchInput;
        this.suggestionContainer = suggestionContainer;
        this.suggestionsBox = suggestionsBox;
        this.settings = {
            searchEngine: 'google',
            ...settings
        };


        this.suggestionContainer.classList.add('netclip_search_hidden');

        // Bind event handlers
        this.handleInput = this.onInput.bind(this);
        this.handleKeydown = this.onKeydown.bind(this);
        this.handleBlur = this.onBlur.bind(this);
        this.handleWindowClick = this.onWindowClick.bind(this);

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.searchInput.addEventListener('input', this.handleInput);
        this.searchInput.addEventListener('keydown', this.handleKeydown);
        this.searchInput.addEventListener('blur', this.handleBlur);
        window.addEventListener('click', this.handleWindowClick, true);

        const frameContainer = document.querySelector('.netClip_frame-container');
        if (frameContainer) {
            frameContainer.addEventListener('click', () => {
                this.hideSuggestions();
            }, true);
        }
    }

    private onInput(): void {
        const query = this.searchInput.value.trim();
        if (query === '') {
            this.hideSuggestions();
        } else {
            this.showSuggestions();
            fetchSuggestions(
                query,
                this.suggestionContainer,
                this.suggestionsBox,
                this.selectSuggestion.bind(this)
            );
        }
    }

    private onKeydown(event: KeyboardEvent): void {
        const suggestions = this.suggestionsBox.children;
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.navigateSuggestions('down', suggestions);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.navigateSuggestions('up', suggestions);
                break;
            case 'Enter':
                event.preventDefault();
                this.handleEnterKey(suggestions);
                break;
            case 'Escape':
                this.hideSuggestions();
                break;
        }
    }

    private onBlur(event: FocusEvent): void {
        setTimeout(() => {
            if (!this.suggestionContainer.contains(document.activeElement)) {
                this.hideSuggestions();
            }
        }, 200);
    }

    private onWindowClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (!this.searchInput.contains(target) &&
            !this.suggestionContainer.contains(target)) {
            this.hideSuggestions();
        }
    }

    private isValidUrl(str: string): boolean {
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    }

    private constructSearchUrl(query: string): string {
        const selectedEngine = this.settings.searchEngine || 'google';
        const baseSearchUrl = this.baseSearchUrls[selectedEngine];
        const encodedQuery = encodeURIComponent(query.trim());
        return `${baseSearchUrl}${encodedQuery}`;
    }

    private navigateToQuery(query: string): string {
        const searchUrl = this.isValidUrl(query)
            ? query
            : this.constructSearchUrl(query);

        const event = new CustomEvent('search-query', {
            detail: { url: searchUrl, query: query }
        });
        this.searchInput.dispatchEvent(event);

        return searchUrl;
    }

    private selectSuggestion(suggestion: string): void {
        this.searchInput.value = suggestion;
        this.navigateToQuery(suggestion);
        this.hideSuggestions();
    }

    private navigateSuggestions(direction: 'up' | 'down', suggestions: HTMLCollection): void {
        if (suggestions.length === 0) return;

        if (this.currentSuggestionIndex !== -1) {
            (suggestions[this.currentSuggestionIndex] as HTMLElement).classList.remove('selected');
        }

        if (direction === 'down') {
            this.currentSuggestionIndex =
                this.currentSuggestionIndex < suggestions.length - 1
                    ? this.currentSuggestionIndex + 1
                    : -1;
        } else {
            this.currentSuggestionIndex =
                this.currentSuggestionIndex > -1
                    ? this.currentSuggestionIndex - 1
                    : suggestions.length - 1;
        }
        if (this.currentSuggestionIndex === -1) {
            this.searchInput.value = this.searchInput.getAttribute('data-original-value') || '';
        } else {
            const selectedSuggestion = suggestions[this.currentSuggestionIndex] as HTMLElement;
            selectedSuggestion.classList.add('selected');
            this.searchInput.value = selectedSuggestion.textContent || '';
        }
    }


    private handleEnterKey(suggestions: HTMLCollection): void {
        if (this.currentSuggestionIndex !== -1 && suggestions[this.currentSuggestionIndex]) {
            (suggestions[this.currentSuggestionIndex] as HTMLElement).click();
        } else {
            const query = this.searchInput.value;
            if (query) {
                this.navigateToQuery(query);
            }
        }
        this.hideSuggestions();
    }


    private showSuggestions(): void {
        this.isVisible = true;
        this.suggestionContainer.classList.remove('netclip_search_hidden');
    }

    private hideSuggestions(): void {
        this.suggestionContainer.classList.add('netclip_search_hidden');
        while (this.suggestionsBox.firstChild) {
            this.suggestionsBox.removeChild(this.suggestionsBox.firstChild);
        }
        this.currentSuggestionIndex = -1;
    }

    public unload(): void {

        this.searchInput.removeEventListener('input', this.handleInput);
        this.searchInput.removeEventListener('keydown', this.handleKeydown);
        this.searchInput.removeEventListener('blur', this.handleBlur);
        window.removeEventListener('click', this.handleWindowClick);

        this.hideSuggestions();


        if (this.suggestionContainer.parentNode) {
            this.suggestionContainer.remove();
        }
        if (this.suggestionsBox.parentNode) {
            this.suggestionsBox.remove();
        }
    }
}
