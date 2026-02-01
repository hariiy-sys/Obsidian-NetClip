import { ItemView, WorkspaceLeaf, TFile, setIcon, Notice } from 'obsidian'
import NetClipPlugin from '../main'
import { getDomain } from '../utils'
import { DeleteConfirmationModal } from '../modal/deleteFiles'
import { ClipperContextMenu } from '../contextMenu'
import { VIEW_TYPE_WORKSPACE_WEBVIEW, WorkspaceLeafWebView } from './EditorWebView'
import { ClipModal } from 'src/modal/clipModal'
import { DEFAULT_IMAGE } from '../assets/image'
import { Menu } from 'obsidian'
import { t } from '../translations'
import { findFirstImageInNote } from '../mediaUtils'

export const CLIPPER_VIEW = 'clipper-view';

export class ClipperHomeView extends ItemView {
    private plugin: NetClipPlugin;
    settings: any;
    private currentCategory: string = '';
    private dragHelperInitialized: boolean = false;
    icon = 'newspaper';

    constructor(leaf: WorkspaceLeaf, plugin: NetClipPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.settings = plugin.settings;
    }

    getViewType(): string {
        return CLIPPER_VIEW;
    }

    getDisplayText(): string {
        return t('clipper_view')
    }

    public async reloadView() {
        this.containerEl.empty();
        await this.onOpen();
    }

    async onOpen() {
        this.containerEl = this.containerEl.children[1] as HTMLElement;
        this.containerEl.empty();

        const clipperContainer = this.containerEl.createEl('div', { cls: 'net_clipper_container' });

        const clipperHeader = clipperContainer.createEl('div', { cls: 'net_clipper_header' });
        const rightContainer = clipperHeader.createEl('div', { cls: 'net_clipper_header_right' });

        const openSettings = rightContainer.createEl('span', { cls: 'netopen_settings', attr: { 'aria-label': t('open_settings') } });
        setIcon(openSettings, 'lucide-bolt');

        if (this.settings.enableWebview) {
            const openWeb = rightContainer.createEl('span', { cls: 'netopen_Web', attr: { 'aria-label': t('open_web') } });
            setIcon(openWeb, 'globe');

            openWeb.addEventListener('click', async () => {
                if (!this.settings.enableWebview) {
                    new Notice(t('webview_disabled_notice'));
                    return;
                }

                const defaultUrl = this.settings.defaultWebUrl || 'https://google.com';
                const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKSPACE_WEBVIEW)
                    .find((leaf: any) => {
                        const view = leaf.view as WorkspaceLeafWebView;
                        return view.url === defaultUrl;
                    });

                if (existingLeaf) {
                    this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
                } else {
                    const leaf = this.app.workspace.getLeaf(true);
                    await leaf.setViewState({
                        type: VIEW_TYPE_WORKSPACE_WEBVIEW,
                        state: { url: defaultUrl }
                    });

                    this.app.workspace.setActiveLeaf(leaf, { focus: true });
                }
            });
        }

        const searchBoxContainer = clipperContainer.createEl('div', { cls: 'netclip_search_box' });
        const searchIcon = searchBoxContainer.createEl('span', { cls: 'netclip_search_icon' });
        setIcon(searchIcon, 'search');
        const searchInput = searchBoxContainer.createEl('input', {
            type: 'text',
            cls: 'netclip_search_input',
            placeholder: t('search_saved_articles')
        });

        const bottomContainer = clipperContainer.createEl('div', { cls: 'netclip_bottom_container' })
        const categoryTabsContainer = bottomContainer.createEl('div', { cls: 'netclip_category_tabs' });
        this.renderCategoryTabs(categoryTabsContainer);

        const sortContainer = bottomContainer.createEl('div', { cls: 'netclip_sort_container' });
        const domainSortButton = sortContainer.createEl('button', {
            cls: 'netclip_sort_button',
            attr: { 'aria-label': t('domain_filter') }
        });
        const sortButton = sortContainer.createEl('button', {
            cls: 'netclip_sort_button',
            attr: { 'aria-label': t('sort_by') }
        });
        setIcon(sortButton, 'arrow-up-down');
        setIcon(domainSortButton, 'earth');

        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const savedContainer = this.containerEl.querySelector('.netclip_saved_container') as HTMLElement;
            this.renderSavedContent(savedContainer, searchTerm);
        })

        const clipButtonContainer = clipperHeader.createEl('div', { cls: 'netclip_button_container' });
        const clipButton = clipButtonContainer.createEl('button', {
            cls: 'netclip_btn',
            attr: { 'aria-label': t('add_clip') }
        });
        setIcon(clipButton, 'plus');

        sortButton.addEventListener('click', (event) => {
            const menu = new Menu();

            menu.addItem((item) =>
                item
                    .setTitle(t('sort_a_z'))
                    .setIcon('arrow-up')
                    .onClick(() => this.applySort('a-z'))
            );

            menu.addItem((item) =>
                item
                    .setTitle(t('sort_z_a'))
                    .setIcon('arrow-down')
                    .onClick(() => this.applySort('z-a'))
            );

            menu.addItem((item) =>
                item
                    .setTitle(t('sort_newest_first'))
                    .setIcon('arrow-down')
                    .onClick(() => this.applySort('new-old'))
            );

            menu.addItem((item) =>
                item
                    .setTitle(t('sort_oldest_first'))
                    .setIcon('arrow-up')
                    .onClick(() => this.applySort('old-new'))
            );

            menu.showAtMouseEvent(event);
        });

        domainSortButton.addEventListener('click', async (event) => {
            const menu = new Menu();
            const files = this.app.vault.getMarkdownFiles();
            const domains = new Set<string>();

            const baseFolderPath = this.settings.parentFolderPath
                ? `${this.settings.parentFolderPath}/${this.settings.defaultFolderName}`
                : this.settings.defaultFolderName;

            await Promise.all(files.map(async file => {
                if (file.path.startsWith(baseFolderPath)) {
                    const content = await this.app.vault.cachedRead(file);
                    const urlMatch = content.match(/source: "([^"]+)"/);
                    if (urlMatch) {
                        const domain = getDomain(urlMatch[1]);
                        domains.add(domain);
                    }
                }
            }));

            menu.addItem((item) =>
                item
                    .setTitle(t('all_domains'))
                    .setIcon('dot')
                    .onClick(() => this.applyDomainFilter(''))
            );

            domains.forEach(domain => {
                const displayName = domain.replace('.com', '');
                menu.addItem((item) =>
                    item
                        .setTitle(displayName)
                        .setIcon('dot')
                        .onClick(() => this.applyDomainFilter(domain))
                );
            });

            menu.showAtMouseEvent(event);
        });

        const SavedContentBox = clipperContainer.createEl("div", { cls: "netclip_saved_container" });

        openSettings.addEventListener('click', () => {
            (this.app as any).setting.open();
            (this.app as any).setting.openTabById(this.plugin.manifest.id);
        });

        clipButton.addEventListener("click", () => {
            new ClipModal(this.app, this.plugin).open();
        });

        await this.renderSavedContent(SavedContentBox);
    }

    private async applySort(sortOrder: string) {
        const savedContainer = this.containerEl.querySelector('.netclip_saved_container') as HTMLElement;
        await this.renderSavedContent(savedContainer, '', sortOrder);
    }

    private async applyDomainFilter(domain: string) {
        const savedContainer = this.containerEl.querySelector('.netclip_saved_container') as HTMLElement;
        await this.renderSavedContent(savedContainer, '', 'a-z', domain);
    }

    public renderCategoryTabs(tabsContainer: HTMLElement) {
        tabsContainer.empty();

        const allTab = tabsContainer.createEl('div', {
            cls: `netclip_category_tab ${this.currentCategory === '' ? 'active' : ''}`,
        });

        const allTabContent = allTab.createEl('div', { cls: 'netclip-category-content' });
        allTabContent.createEl('span', { text: t('all') });

        allTab.dataset.category = '';
        allTab.addEventListener('click', () => this.switchCategory('', tabsContainer));
        allTab.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; allTab.classList.add('drag-over'); const h = document.querySelector('.netclip-drag-helper') as HTMLElement | null; if (h) { const action = h.querySelector('.netclip-drag-action') as HTMLElement | null; if (action) action.textContent = `Move to "${t('all')}"`; } });
        allTab.addEventListener('dragleave', () => { allTab.classList.remove('drag-over'); const h = document.querySelector('.netclip-drag-helper') as HTMLElement | null; if (h) { const action = h.querySelector('.netclip-drag-action') as HTMLElement | null; if (action) action.textContent = 'Move'; } });
        allTab.addEventListener('drop', async (e: DragEvent) => {
            e.preventDefault();
            allTab.classList.remove('drag-over');
            const path = e.dataTransfer?.getData('text/plain');
            if (!path) return;
            const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
            if (!file || !(file as TFile).path) return;

            const baseFolderPath = this.settings.parentFolderPath
                ? `${this.settings.parentFolderPath}/${this.settings.defaultFolderName}`
                : this.settings.defaultFolderName;

            const destFolder = `${baseFolderPath}`;
            try {
                if (!this.app.vault.getAbstractFileByPath(destFolder)) {
                    await this.app.vault.createFolder(destFolder);
                }
                const newPath = `${destFolder}/${(file as TFile).name}`;
                if (file.path === newPath) {
                    new Notice(t('already_in_category'));
                    return;
                }
                await this.app.fileManager.renameFile(file as any, newPath);
                new Notice(t('moved_to_category').replace('{0}', t('all')));

                const savedContainer = this.containerEl.querySelector('.netclip_saved_container') as HTMLElement;
                await this.renderSavedContent(savedContainer);
                this.renderCategoryTabs(tabsContainer);
            } catch (error) {
                new Notice(t('move_failed').replace('{0}', String(error)));
            }
        });

        if (!this.dragHelperInitialized) {
            this.dragHelperInitialized = true;
            const dragHelper = document.createElement('div');
            dragHelper.className = 'netclip-drag-helper';
            dragHelper.style.display = 'none';
            document.body.appendChild(dragHelper);

            const onDocDragOver = (e: DragEvent) => {
                try {
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                } catch (err) { }
                const h = document.querySelector('.netclip-drag-helper') as HTMLElement | null;
                if (h) {
                    h.style.display = 'block';
                    h.style.left = (e.clientX + 16) + 'px';
                    h.style.top = (e.clientY + 16) + 'px';
                }
            };

            const onDocDragEnd = () => {
                const h = document.querySelector('.netclip-drag-helper') as HTMLElement | null;
                if (h) { h.style.display = 'none'; h.textContent = '' }
                document.body.classList.remove('netclip-dragging');
            };

            document.addEventListener('dragover', onDocDragOver);
            document.addEventListener('dragend', onDocDragEnd);
            document.addEventListener('dragleave', (e) => {
                // hide when leaving window
                if ((e as any).relatedTarget == null) {
                    const h = document.querySelector('.netclip-drag-helper') as HTMLElement | null;
                    if (h) { h.style.display = 'none'; h.textContent = '' }
                    document.body.classList.remove('netclip-dragging');
                }
            });
        }

        this.plugin.settings.categories.forEach(category => {
            const tab = tabsContainer.createEl('div', {
                cls: `netclip_category_tab ${this.currentCategory === category ? 'active' : ''}`,
            });

            const tabContent = tab.createEl('div', { cls: 'netclip-category-content' });

            if (this.plugin.settings.categoryIcons[category]) {
                const iconSpan = tabContent.createEl('span', { cls: 'category-icon' });
                setIcon(iconSpan, this.plugin.settings.categoryIcons[category]);
            }

            tabContent.createEl('span', { text: category });


            tab.dataset.category = category;
            tab.addEventListener('click', () => this.switchCategory(category, tabsContainer));
            tab.addEventListener('dragover', (e: DragEvent) => {
                e.preventDefault();
                try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch (err) { }
                tab.classList.add('drag-over');
                const h = document.querySelector('.netclip-drag-helper') as HTMLElement | null;
                if (h) {
                    const action = h.querySelector('.netclip-drag-action') as HTMLElement | null;
                    if (action) action.textContent = `Move to "${category}"`;
                }
            });
            tab.addEventListener('dragleave', () => {
                tab.classList.remove('drag-over');
                const h = document.querySelector('.netclip-drag-helper') as HTMLElement | null;
                if (h) {
                    const action = h.querySelector('.netclip-drag-action') as HTMLElement | null;
                    if (action) action.textContent = 'Move';
                }
            });
            tab.addEventListener('drop', async (e: DragEvent) => {
                e.preventDefault();
                tab.classList.remove('drag-over');
                const path = e.dataTransfer?.getData('text/plain');
                if (!path) return;
                const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
                if (!file || !(file as TFile).path) return;

                const baseFolderPath = this.settings.parentFolderPath
                    ? `${this.settings.parentFolderPath}/${this.settings.defaultFolderName}`
                    : this.settings.defaultFolderName;

                const destFolder = `${baseFolderPath}/${category}`;
                try {
                    if (!this.app.vault.getAbstractFileByPath(destFolder)) {
                        await this.app.vault.createFolder(destFolder);
                    }
                    const newPath = `${destFolder}/${(file as TFile).name}`;
                    if (file.path === newPath) {
                        new Notice(t('already_in_category'));
                        return;
                    }
                    await this.app.fileManager.renameFile(file as any, newPath);
                    new Notice(t('moved_to_category').replace('{0}', category));

                    const savedContainer = this.containerEl.querySelector('.netclip_saved_container') as HTMLElement;
                    await this.renderSavedContent(savedContainer);
                    this.renderCategoryTabs(tabsContainer);
                } catch (error) {
                    new Notice(t('move_failed').replace('{0}', String(error)));
                }
            });
        })

        // allow vertical wheel to scroll horizontally when hovering
        tabsContainer.addEventListener('wheel', (e: WheelEvent) => {
            if (Math.abs(e.deltaY) === 0) return;
            e.preventDefault();
            tabsContainer.scrollLeft += e.deltaY;
        }, { passive: false });


        tabsContainer.tabIndex = 0;
        tabsContainer.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') tabsContainer.scrollLeft += 120;
            if (e.key === 'ArrowLeft') tabsContainer.scrollLeft -= 120;
        });

        let isDown = false;
        let startX = 0;
        let scrollLeft = 0;
        tabsContainer.addEventListener('mousedown', (e: MouseEvent) => {
            isDown = true;
            tabsContainer.classList.add('dragging');
            startX = e.pageX - tabsContainer.getBoundingClientRect().left;
            scrollLeft = tabsContainer.scrollLeft;
        });
        tabsContainer.addEventListener('mouseleave', () => {
            isDown = false;
            tabsContainer.classList.remove('dragging');
        });
        tabsContainer.addEventListener('mouseup', () => {
            isDown = false;
            tabsContainer.classList.remove('dragging');
        });
        tabsContainer.addEventListener('mousemove', (e: MouseEvent) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - tabsContainer.getBoundingClientRect().left;
            const walk = (x - startX) * 1.5;
            tabsContainer.scrollLeft = scrollLeft - walk;
        });
    }

    private async switchCategory(category: string, tabsContainer: HTMLElement) {
        this.currentCategory = category;

        const tabs = tabsContainer.querySelectorAll('.netclip_category_tab');
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if ((category === '' && tab.textContent === t('all')) ||
                tab.textContent === category) {
                tab.classList.add('active');
            }
        });

        const savedContainer = this.containerEl.querySelector(".netclip_saved_container") as HTMLElement;
        await this.renderSavedContent(savedContainer);
    }

    public async renderSavedContent(container: HTMLElement, filter: string = '', sortOrder: string = 'new-old', domainFilter: string = '') {
        container.empty();

        const files = this.app.vault.getMarkdownFiles();
        const baseFolderPath = this.settings.parentFolderPath
            ? `${this.settings.parentFolderPath}/${this.settings.defaultFolderName}`
            : this.settings.defaultFolderName;

        const clippedFiles = files.filter(file => {
            const basePrefix = `${baseFolderPath}/`;
            const isInMainFolder = file.path.startsWith(basePrefix);
            if (!this.currentCategory) {
                return isInMainFolder;
            }
            const categoryPath = `${baseFolderPath}/${this.currentCategory}`;
            const categoryPrefix = `${categoryPath}/`;
            return file.path.startsWith(categoryPrefix);
        });

        let filteredFiles = filter
            ? clippedFiles.filter(file => file.basename.toLowerCase().includes(filter))
            : clippedFiles;

        if (domainFilter) {
            filteredFiles = (await Promise.all(filteredFiles.map(async file => {
                const content = await this.app.vault.cachedRead(file);
                const urlMatch = content.match(/source: "([^"]+)"/);
                if (urlMatch) {
                    const domain = getDomain(urlMatch[1]);
                    return domain === domainFilter ? file : null;
                }
                return null;
            }))).filter(Boolean) as TFile[];
        }

        const sortedFiles = filteredFiles.sort((a, b) => {
            switch (sortOrder) {
                case 'a-z':
                    return a.basename.localeCompare(b.basename);
                case 'z-a':
                    return b.basename.localeCompare(a.basename);
                case 'new-old':
                    return b.stat.mtime - a.stat.mtime;
                case 'old-new':
                    return a.stat.mtime - b.stat.mtime;
                default:
                    return 0;
            }
        });

        if (sortedFiles.length === 0) {
            const emptyContainer = container.createEl('div', { cls: 'empty_box' });
            const emptyIcon = emptyContainer.createEl("span", { cls: 'empty_icon' });
            setIcon(emptyIcon, 'lucide-book-open');
            emptyContainer.createEl("p", { text: t('no_matching_articles') });
            return;
        }

        for (const file of sortedFiles) {
            const content = await this.app.vault.cachedRead(file);
            const clippedEl = container.createEl('div', { cls: 'netClip_card' });
            // make the card draggable to move between categories
            clippedEl.setAttribute('draggable', 'true');
            clippedEl.dataset.path = file.path;
            clippedEl.addEventListener('dragstart', (e: DragEvent) => {
                const dt = e.dataTransfer;
                if (dt) {
                    dt.setData('text/plain', file.path);
                    dt.effectAllowed = 'move';
                    try {
                        const img = new Image();
                        img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                        dt.setDragImage(img, 0, 0);
                    } catch (err) {

                    }
                }

                const helper = document.querySelector('.netclip-drag-helper') as HTMLElement | null;
                if (helper) {
                    const thumb = clippedEl.dataset.thumbnail || '';
                    const title = clippedEl.dataset.title || file.basename;
                    helper.innerHTML = `<img class="netclip-drag-thumb" src="${thumb}" alt=""/><div class="netclip-drag-info"><div class="netclip-drag-title">${title}</div><div class="netclip-drag-action">Move</div></div>`;
                    helper.style.display = 'block';
                }

                clippedEl.classList.add('dragging-card');
                document.body.classList.add('netclip-dragging');
            });
            clippedEl.addEventListener('dragend', () => {
                clippedEl.classList.remove('dragging-card');
                document.body.classList.remove('netclip-dragging');
                const helper = document.querySelector('.netclip-drag-helper') as HTMLElement | null;
                if (helper) { helper.style.display = 'none'; helper.innerHTML = ''; }
            });

            if (this.settings.cardDisplay.showThumbnail) {
                const frontmatterMatch = content.match(/^---[\s\S]*?thumbnail: "([^"]+)"[\s\S]*?---/);
                let thumbnailUrl = frontmatterMatch ? frontmatterMatch[1] : null;

                if (!thumbnailUrl) {
                    const thumbnailMatch = content.match(/!\[Thumbnail\]\((.+)\)/);
                    thumbnailUrl = thumbnailMatch ? thumbnailMatch[1] : null;
                }

                if (!thumbnailUrl) {
                    thumbnailUrl = await findFirstImageInNote(this.app, content);
                }

                clippedEl.createEl("img", {
                    attr: {
                        src: thumbnailUrl || DEFAULT_IMAGE,
                        loading: "lazy"
                    }
                });

                clippedEl.dataset.thumbnail = (thumbnailUrl || DEFAULT_IMAGE) as string;
                clippedEl.dataset.title = file.basename;
            }

            const contentContainer = clippedEl.createEl('div', { cls: 'netclip_card_content' });

            const topContainer = contentContainer.createEl('div', { cls: 'netclip_card_top' });
            const clippedTitle = topContainer.createEl("h6", { text: file.basename });
            clippedTitle.addEventListener('click', () => {
                this.openArticle(file);
            });

            if (this.settings.cardDisplay.showDescription) {
                const descriptionMatch = content.match(/desc:\s*(?:"([^"]+)"|([^\n]+))/);
                if (descriptionMatch) {
                    topContainer.createEl("p", {
                        cls: "netclip_card_description",
                        text: descriptionMatch[1] || descriptionMatch[2]
                    });
                }
            }

            const metaContainer = topContainer.createEl("div", { cls: "netclip_card_meta" });

            if (this.settings.cardDisplay.showAuthor) {
                const authorMatch = content.match(/author:\s*(?:"([^"]+)"|([^\n]+))/);
                if (authorMatch) {
                    metaContainer.createEl("span", {
                        cls: "netclip_card_author",
                        text: authorMatch[1] || authorMatch[2]
                    });
                }
            }

            if (this.settings.cardDisplay.showDate) {
                const creationDate = new Date(file.stat.ctime);
                const formattedDate = creationDate.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                metaContainer.createEl("span", {
                    cls: "netclip_card_date",
                    text: formattedDate
                });
            }

            const bottomContent = contentContainer.createEl("div", { cls: "netclip_card_bottom" });
            const urlMatch = content.match(/source: "([^"]+)"/);

            if (this.settings.cardDisplay.showDomain && urlMatch) {
                const articleUrl = urlMatch[1];
                const domainName = getDomain(articleUrl);
                bottomContent.createEl("a", {
                    cls: "domain",
                    href: articleUrl,
                    text: domainName
                });
            }

            this.createMenuButton(bottomContent, file, urlMatch?.[1]);

            container.appendChild(clippedEl);
        }
    }

    private createMenuButton(bottomContent: HTMLElement, file: TFile, url?: string) {
        const menuButton = bottomContent.createEl("span", { cls: "menu-button" });
        setIcon(menuButton, 'more-vertical');

        menuButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const contextMenu = new ClipperContextMenu(
                this.app,
                file,
                this.showDeleteConfirmation.bind(this),
                this.openArticle.bind(this),
                url
            );
            contextMenu.show(menuButton);
        });
    }

    private showDeleteConfirmation(file: TFile) {
        const modal = new DeleteConfirmationModal(
            this.app,
            file,
            async () => {
                await this.app.fileManager.trashFile(file);
                const savedContainer = this.containerEl.querySelector(".netclip_saved_container") as HTMLElement;
                await this.renderSavedContent(savedContainer);
            }
        );
        modal.open();
    }

    private openArticle(file: TFile) {
        const openLeaves = this.app.workspace.getLeavesOfType("markdown");
        const targetLeaf = openLeaves.find((leaf) => {
            const viewState = leaf.getViewState();
            return viewState.type === "markdown" && viewState.state?.file === file.path;
        });

        if (targetLeaf) {
            this.app.workspace.revealLeaf(targetLeaf);
        } else {
            this.app.workspace.openLinkText(file.path, '', true);
        }
    }
}