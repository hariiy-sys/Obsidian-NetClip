import { App, ButtonComponent, Notice, PluginSettingTab, setIcon, Setting, TFolder } from 'obsidian';
import NetClipPlugin from './main';
import { CLIPPER_VIEW } from './view/ClipperView';
import { DeleteCategoryModal } from './modal/deleteCategory';
import { FolderSelectionModal } from './modal/folderSelection';
import { t } from './translations';
import { PromptModal } from './modal/promptModal';
import { AIPrompt } from './settings';
import { Modal } from 'obsidian';
import { GeminiService } from './services/gemini';

interface TabContent {
    content: HTMLElement;
    heading: HTMLElement;
    navButton: HTMLElement;
}


export default class NetClipSettingTab extends PluginSettingTab {
    plugin: NetClipPlugin;
    viewPosition: string;
    defaultFolderName: string;
    defaultWebUrl: string;
    searchEngine: 'google' | 'youtube' | 'bing' | 'perplexity' | 'duckduckgo' | 'kagi' | 'brave';
    webViewControls: any;
    id: string;
    categories: string[];
    private folderRenameText: HTMLInputElement;
    private confirmButton: ButtonComponent;
    private newFolderName: string = '';
    private selectedTab = 'Web view'
    private tabContent: Map<string, TabContent> = new Map();

    constructor(app: App, plugin: NetClipPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async onload() {
        await this.syncCategoriesFolders();
    }

    private async syncCategoriesFolders() {
        const mainFolderPath = this.plugin.settings.parentFolderPath
            ? `${this.plugin.settings.parentFolderPath}/${this.plugin.settings.defaultFolderName}`
            : this.plugin.settings.defaultFolderName;

        const mainFolder = this.app.vault.getFolderByPath(mainFolderPath);
        if (!mainFolder) return;

        const subfolders = mainFolder.children
            .filter(file => file instanceof TFolder)
            .map(folder => folder.name);

        this.plugin.settings.categories = subfolders;
        await this.plugin.saveSettings();
    }

    private async deleteCategory(category: string) {
        const baseFolderPath = this.plugin.settings.parentFolderPath
            ? `${this.plugin.settings.parentFolderPath}/${this.plugin.settings.defaultFolderName}`
            : this.plugin.settings.defaultFolderName;

        const folderPath = `${baseFolderPath}/${category}`;
        const folder = this.app.vault.getFolderByPath(folderPath);

        if (!(folder)) {
            return false
        }

        if (folder.children.length > 0) {
            const confirmed = await new Promise((resolve) => {
                new DeleteCategoryModal(
                    this.app,
                    category,
                    (result) => resolve(result)
                ).open();
            });
            if (!confirmed) return false;
        }

        await this.app.fileManager.trashFile(folder);

        const index = this.plugin.settings.categories.indexOf(category);
        if (index > -1) {
            this.plugin.settings.categories.splice(index, 1);
            await this.plugin.saveSettings();
        }

        new Notice(t('category_deleted').replace('{0}', category));
        return true;
    }



    private async createCategoryFolder(categoryName: string): Promise<boolean> {
        const baseFolderPath = this.plugin.settings.parentFolderPath
            ? `${this.plugin.settings.parentFolderPath}/${this.plugin.settings.defaultFolderName}`
            : this.plugin.settings.defaultFolderName;

        const folderPath = `${baseFolderPath}/${categoryName}`;
        const existingFolder = this.app.vault.getFolderByPath(folderPath);

        if (existingFolder) {
            new Notice(`Category "${categoryName}" already exists`);
            return false;
        }

        const baseFolder = this.app.vault.getFolderByPath(baseFolderPath);
        if (!baseFolder) {
            if (this.plugin.settings.parentFolderPath &&
                !this.app.vault.getFolderByPath(this.plugin.settings.parentFolderPath)) {
                await this.app.vault.createFolder(this.plugin.settings.parentFolderPath);
            }
            await this.app.vault.createFolder(baseFolderPath);
        }

        await this.app.vault.createFolder(folderPath);
        return true;
    }



    private async renameFolderAndUpdatePaths(oldPath: string, newPath: string): Promise<boolean> {
        const fullOldPath = this.plugin.settings.parentFolderPath
            ? `${this.plugin.settings.parentFolderPath}/${oldPath}`
            : oldPath;

        const fullNewPath = this.plugin.settings.parentFolderPath
            ? `${this.plugin.settings.parentFolderPath}/${newPath}`
            : newPath;

        const oldFolder = this.app.vault.getFolderByPath(fullOldPath);
        if (!oldFolder) {
            new Notice(t('folder_not_found').replace('{0}', fullOldPath));
            return false;
        }

        const newFolder = this.app.vault.getFolderByPath(fullNewPath);
        if (newFolder) {
            new Notice(t('folder_exists').replace('{0}', fullNewPath));
            return false;
        }

        await this.app.fileManager.renameFile(oldFolder, fullNewPath);

        for (const category of this.plugin.settings.categories) {
            const oldCategoryPath = `${fullOldPath}/${category}`;
            const newCategoryPath = `${fullNewPath}/${category}`;
            const categoryFolder = this.app.vault.getFolderByPath(oldCategoryPath);
            if (categoryFolder) {
                await this.app.fileManager.renameFile(categoryFolder, newCategoryPath);
            }
        }

        return true;
    }

    private async openEditCategoryModal(oldCategoryName: string) {
        const modal = new Modal(this.app);
        modal.titleEl.setText(`Edit Category: ${oldCategoryName}`);

        const content = modal.contentEl;
        let newCategoryName = oldCategoryName;

        new Setting(content)
            .setName('New category name')
            .setDesc('Enter the new name for this category')
            .addText(text => text
                .setPlaceholder('Enter new category name')
                .setValue(oldCategoryName)
                .onChange(value => {
                    newCategoryName = value.trim();
                }));

        new Setting(content)
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => {
                    modal.close();
                }))
            .addButton(btn => btn
                .setButtonText('Rename')
                .setCta()
                .onClick(async () => {
                    if (!newCategoryName) {
                        new Notice(t('please_enter_category_name'));
                        return;
                    }

                    if (newCategoryName === oldCategoryName) {
                        modal.close();
                        return;
                    }

                    if (this.plugin.settings.categories.includes(newCategoryName)) {
                        new Notice(`Category "${newCategoryName}" already exists`);
                        return;
                    }

                    const baseFolderPath = this.plugin.settings.parentFolderPath
                        ? `${this.plugin.settings.parentFolderPath}/${this.plugin.settings.defaultFolderName}`
                        : this.plugin.settings.defaultFolderName;

                    const oldPath = `${baseFolderPath}/${oldCategoryName}`;
                    const newPath = `${baseFolderPath}/${newCategoryName}`;

                    const oldFolder = this.app.vault.getFolderByPath(oldPath);
                    if (!oldFolder) {
                        new Notice(`Category folder not found`);
                        return;
                    }

                    const newFolder = this.app.vault.getFolderByPath(newPath);
                    if (newFolder) {
                        new Notice(`Category "${newCategoryName}" already exists`);
                        return;
                    }

                    try {
                        await this.app.fileManager.renameFile(oldFolder, newPath);

                        // Update settings
                        const categoryIndex = this.plugin.settings.categories.indexOf(oldCategoryName);
                        if (categoryIndex > -1) {
                            this.plugin.settings.categories[categoryIndex] = newCategoryName;
                        }

                        // Update category icons if they exist
                        if (this.plugin.settings.categoryIcons[oldCategoryName]) {
                            this.plugin.settings.categoryIcons[newCategoryName] = this.plugin.settings.categoryIcons[oldCategoryName];
                            delete this.plugin.settings.categoryIcons[oldCategoryName];
                        }

                        await this.plugin.saveSettings();
                        new Notice(`Category renamed to "${newCategoryName}"`);
                        this.display();
                        modal.close();
                    } catch (error) {
                        new Notice(`Failed to rename category: ${error}`);
                    }
                }));

        modal.open();
    }

    private settingTitile() {
        new Setting(this.containerEl).setName('Netclip').setHeading();
    }


    private addTabHeader() {
        const navContainer = this.containerEl.createEl("nav", {
            cls: "netclip-setting-header",
        });

        const navigateEl = navContainer.createDiv("netclip-setting-tab-group");
        const settingsEl = this.containerEl.createDiv("netclip-setting-content");

        this.createTabAndContent(
            "Web view",
            navigateEl,
            settingsEl,
            (el: HTMLElement) => this.webViewSettings(el)
        );

        this.createTabAndContent(
            "Clipper",
            navigateEl,
            settingsEl,
            (el: HTMLElement) => this.clipperTab(el)
        );

        this.createTabAndContent(
            "Home",
            navigateEl,
            settingsEl,
            (el: HTMLElement) => this.homeTab(el)
        );
        this.createTabAndContent(
            "AI prompts",
            navigateEl,
            settingsEl,
            (el: HTMLElement) => this.aiTab(el)
        );

        this.createTabAndContent(
            "Support",
            navigateEl,
            settingsEl,
            (el: HTMLElement) => this.supportTab(el)
        );
    }


    private createTabAndContent(
        tabName: string,
        navigateEl: HTMLElement,
        containerEl: HTMLElement,
        generateTabContent?: (el: HTMLElement) => void
    ) {
        const displayTabContent = this.selectedTab === tabName;
        const tabEl = navigateEl.createDiv("netclip-navigation-item");

        if (displayTabContent) {
            tabEl.addClass("netclip-navigation-item-selected");
        }

        const iconMap: { [key: string]: string } = {
            "Web view": "globe",
            "Clipper": "scissors",
            "AI prompts": "bot",
            "Home": "home",
            "Support": "help",
        }

        if (iconMap[tabName]) {
            const iconEl = tabEl.createSpan({
                cls: "netclip-tab-icon"
            })
            setIcon(iconEl, iconMap[tabName]);
        }

        const translationKey = tabName.toLowerCase().replace(/\s+/g, '_') + '_tab';
        tabEl.createSpan().setText(t(translationKey));

        tabEl.onclick = () => {
            if (this.selectedTab === tabName) return;
            const tab = this.tabContent.get(tabName);
            (tab?.content as HTMLElement).show();

            tabEl.addClass("netclip-navigation-item-selected");

            if (this.selectedTab) {
                const prevTab = this.tabContent.get(this.selectedTab);
                prevTab?.navButton.removeClass("netclip-navigation-item-selected");
                (prevTab?.content as HTMLElement).hide();
            }
            this.selectedTab = tabName;
        };

        const tabContent = containerEl.createDiv("netclip-tab-settings");
        if (!displayTabContent) {
            (tabContent as HTMLElement).hide();
        }

        if (generateTabContent) {
            generateTabContent(tabContent);
        }

        this.tabContent.set(tabName, {
            content: tabContent,
            heading: tabContent,
            navButton: tabEl,
        });

    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.settingTitile();
        this.addTabHeader()
    }


    private webViewSettings(containerEl: HTMLElement) {
        new Setting(containerEl).setName('Web view').setHeading()
        this.syncCategoriesFolders();

        if ((window as any).Platform?.isMobileApp || (typeof (window as any).cordova !== 'undefined')) {
            const warning = containerEl.createDiv('netclip-info-box');
            const infoContent = warning.createDiv('netclip-info-content');
            const infoIcon = infoContent.createSpan('netclip-info-icon');
            setIcon(infoIcon, 'alert-triangle');
            const textSpan = infoContent.createSpan();
            textSpan.setText('Web view is not supported on mobile devices. You can still use the clipper and other features.');
        }

        new Setting(containerEl)
            .setName('Search engine')
            .setDesc('Choose your preferred search engine for the web view')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('google', 'Google')
                    .addOption('youtube', 'YouTube')
                    .addOption('bing', 'Bing')
                    .addOption('perplexity', 'Perplexity')
                    .addOption('duckduckgo', 'Duckduckgo')
                    .addOption('kagi', 'Kagi')
                    .addOption('brave', 'Brave')
                    .onChange(async (value: 'google' | 'youtube' | 'bing' | 'perplexity' | 'duckduckgo' | 'kagi' | 'brave') => {
                        this.plugin.settings.searchEngine = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t('default_url'))
            .setDesc(t('default_url_desc'))
            .addText(text =>
                text
                    .setPlaceholder(t('enter_default_url'))
                    .setValue(this.plugin.settings.defaultWebUrl)
                    .onChange(async (value) => {
                        try {
                            new URL(value);
                            this.plugin.settings.defaultWebUrl = value;
                            await this.plugin.saveSettings();
                        } catch {
                            new Notice(t('invalid_url'));
                        }
                    })
            );

        new Setting(containerEl)
            .setName(t('enable_ad_blocking'))
            .setDesc(t('enable_ad_blocking_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.adBlock.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.adBlock.enabled = value;
                    await this.plugin.saveSettings();
                    this.display
                })
            )

        new Setting(containerEl)
            .setName(t('private_mode'))
            .setDesc(t('private_mode_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.privateMode)
                .onChange(async (value) => {
                    this.plugin.settings.privateMode = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName(t('enable_webview'))
            .setDesc(t('enable_webview_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWebview)
                .onChange(async (value) => {
                    await this.plugin.setWebviewEnabled(value);
                    await this.plugin.refreshHomeViews();
                    this.display();
                })
            );
    }



    private clipperTab(containerEl: HTMLElement) {
        new Setting(containerEl).setName('Clipper').setHeading()

        new Setting(containerEl)
            .setName('View position')
            .setDesc('Choose where to display the clipper view')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('left', t('left_sidebar'))
                    .addOption('right', t('right_sidebar'))
                    .addOption('default', t('default_position'))
                    .setValue(this.plugin.settings.viewPosition)
                    .onChange(async (value: 'left' | 'right' | 'default') => {
                        this.plugin.settings.viewPosition = value;
                        await this.plugin.saveSettings();

                        const leaves = this.app.workspace.getLeavesOfType(CLIPPER_VIEW);
                        if (leaves.length > 0) {
                            const activeLeaf = leaves[0];
                            activeLeaf.detach();
                            this.plugin.activateView();
                        }
                    })
            );

        new Setting(containerEl).setName('Card Display').setHeading();

        new Setting(containerEl)
            .setName('Show Description')
            .setDesc('Show article description in the card')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.cardDisplay.showDescription)
                .onChange(async (value) => {
                    this.plugin.settings.cardDisplay.showDescription = value;
                    await this.plugin.saveSettings();
                    await this.plugin.updateHomeView();
                }));

        new Setting(containerEl)
            .setName('Show Author')
            .setDesc('Show article author in the card')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.cardDisplay.showAuthor)
                .onChange(async (value) => {
                    this.plugin.settings.cardDisplay.showAuthor = value;
                    await this.plugin.saveSettings();
                    await this.plugin.updateHomeView();
                }));

        new Setting(containerEl)
            .setName('Show Date')
            .setDesc('Show article date in the card')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.cardDisplay.showDate)
                .onChange(async (value) => {
                    this.plugin.settings.cardDisplay.showDate = value;
                    await this.plugin.saveSettings();
                    await this.plugin.updateHomeView();
                }));

        new Setting(containerEl)
            .setName('Show Domain')
            .setDesc('Show article source domain in the card')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.cardDisplay.showDomain)
                .onChange(async (value) => {
                    this.plugin.settings.cardDisplay.showDomain = value;
                    await this.plugin.saveSettings();
                    await this.plugin.updateHomeView();
                }));

        new Setting(containerEl)
            .setName('Show Thumbnail')
            .setDesc('Show article thumbnail image in the card')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.cardDisplay.showThumbnail)
                .onChange(async (value) => {
                    this.plugin.settings.cardDisplay.showThumbnail = value;
                    await this.plugin.saveSettings();
                    await this.plugin.updateHomeView();
                }));

        new Setting(containerEl)
            .setName(t('parent_folder'))
            .setDesc(t('parent_folder_desc'))
            .addButton(button => {
                const displayPath = this.plugin.settings.parentFolderPath || t('vault_root');
                return button
                    .setClass('net-clip-button')
                    .setButtonText(displayPath)
                    .onClick(async () => {
                        const modal = new FolderSelectionModal(this.app, this.plugin);
                        modal.onChooseFolder(async (folderPath) => {
                            this.plugin.settings.parentFolderPath = folderPath;
                            await this.plugin.saveSettings();
                            await this.plugin.FoldersExist();
                            this.display();
                        });
                        modal.open();
                    });
            });

        new Setting(containerEl)
            .setName(t('change_folder_name'))
            .setDesc(t('change_folder_name_desc'))
            .addText(text => {
                this.folderRenameText = text.inputEl;
                return text
                    .setPlaceholder(t('enter_folder_name'))
                    .setValue(this.plugin.settings.defaultFolderName)
                    .onChange((value) => {
                        const newName = value.trim();
                        if (newName === '') {
                            this.confirmButton?.setDisabled(true);
                            return;
                        }

                        this.newFolderName = newName;
                        this.confirmButton?.setDisabled(false);
                    });
            })
            .addButton(button => {
                this.confirmButton = button
                    .setButtonText(t('confirm'))
                    .setDisabled(true)
                    .onClick(async () => {
                        if (this.newFolderName === this.plugin.settings.defaultFolderName) {
                            this.confirmButton.setDisabled(true);
                            return;
                        }

                        const success = await this.renameFolderAndUpdatePaths(
                            this.plugin.settings.defaultFolderName,
                            this.newFolderName
                        );

                        if (success) {
                            this.plugin.settings.defaultFolderName = this.newFolderName;
                            await this.plugin.saveSettings();
                            new Notice(t('folder_renamed').replace('{0}', this.newFolderName));
                            this.confirmButton.setDisabled(true);
                        } else {
                            this.folderRenameText.value = this.plugin.settings.defaultFolderName;
                            this.confirmButton.setDisabled(true);
                        }
                    });
                return button;
            });


        new Setting(containerEl)
            .setName('Default Quick Save Location')
            .setDesc('Choose where to save clips when no domain-specific location is set')
            .addButton(button => {
                const currentPath = this.plugin.settings.defaultSaveLocations.defaultLocation;
                const displayPath = currentPath || 'Choose Location';
                return button
                    .setButtonText(displayPath)
                    .onClick(async () => {
                        const modal = new FolderSelectionModal(this.app, this.plugin);
                        modal.onChooseFolder(async (folderPath) => {
                            this.plugin.settings.defaultSaveLocations.defaultLocation = folderPath;
                            await this.plugin.saveSettings();
                            this.display();
                        });
                        modal.open();
                    });
            });

        new Setting(containerEl)
            .setName('Domain-Specific Save Locations')
            .setDesc('Set specific save locations for different websites')
            .addButton(button => button
                .setButtonText('Add New Domain')
                .setCta()
                .onClick(() => {
                    const modal = new Modal(this.app);
                    modal.titleEl.setText('Add Domain Save Location');

                    const content = modal.contentEl;
                    let domainValue = '';
                    let locationValue = '';
                    let locationButton: ButtonComponent;

                    new Setting(content)
                        .setName('Domain')
                        .setDesc('Enter website domain (e.g., reddit.com)')
                        .addText(text => text
                            .setPlaceholder('Enter domain')
                            .onChange(value => {
                                domainValue = value.trim().toLowerCase();
                            }));

                    new Setting(content)
                        .setName('Save Location')
                        .addButton(button => {
                            locationButton = button;
                            return button
                                .setButtonText('Choose Location')
                                .onClick(() => {
                                    const folderModal = new FolderSelectionModal(this.app, this.plugin);
                                    folderModal.onChooseFolder(path => {
                                        locationValue = path;
                                        locationButton.setButtonText(path || 'Choose Location');
                                    });
                                    folderModal.open();
                                });
                        });

                    new Setting(content)
                        .addButton(button => button
                            .setButtonText('Save')
                            .setCta()
                            .onClick(async () => {
                                if (domainValue && locationValue) {
                                    this.plugin.settings.defaultSaveLocations.domainMappings[domainValue] = locationValue;
                                    await this.plugin.saveSettings();
                                    this.display();
                                    modal.close();
                                }
                            }))
                        .addButton(button => button
                            .setButtonText('Cancel')
                            .onClick(() => {
                                modal.close();
                            }));

                    modal.open();
                }));

        Object.entries(this.plugin.settings.defaultSaveLocations.domainMappings).forEach(([domain, location]) => {
            new Setting(containerEl)
                .setName(domain)
                .setDesc(`Saves to: ${location}`)
                .addButton(button => button
                    .setButtonText('Edit')
                    .onClick(() => {
                        const folderModal = new FolderSelectionModal(this.app, this.plugin);
                        folderModal.onChooseFolder(async (path) => {
                            this.plugin.settings.defaultSaveLocations.domainMappings[domain] = path;
                            await this.plugin.saveSettings();
                            this.display();
                        });
                        folderModal.open();
                    }))
                .addButton(button => button
                    .setButtonText('Delete')
                    .onClick(async () => {
                        delete this.plugin.settings.defaultSaveLocations.domainMappings[domain];
                        await this.plugin.saveSettings();
                        this.display();
                    }));
        });

        new Setting(containerEl)
            .setName(t('categories'))
            .setDesc(t('categories_desc'))
            .addText(text => {
                const textComponent = text.setPlaceholder(t('new_category_name'));
                const storedTextComponent = textComponent;

                textComponent.inputEl.onkeydown = async (e) => {
                    if (e.key === 'Enter') {
                        const value = textComponent.getValue().trim();
                        if (value && !this.plugin.settings.categories.includes(value)) {
                            if (await this.createCategoryFolder(value)) {
                                this.plugin.settings.categories.push(value);
                                await this.plugin.saveSettings();
                                textComponent.setValue('');
                                this.display();
                            }
                        }
                    }
                };
                return textComponent;
            })
            .addButton(button => {
                return button
                    .setButtonText(t('create'))
                    .onClick(async () => {
                        const settingItem = button.buttonEl.closest('.setting-item');
                        if (!settingItem) return;

                        const textInput = settingItem.querySelector('input') as HTMLInputElement;
                        if (!textInput) return;

                        const value = textInput.value.trim();

                        if (!value) {
                            new Notice(t('please_enter_category_name'));
                            return;
                        }

                        if (this.plugin.settings.categories.includes(value)) {
                            new Notice(t('category_exists').replace('{0}', value));
                            return;
                        }

                        if (await this.createCategoryFolder(value)) {
                            this.plugin.settings.categories.push(value);
                            await this.plugin.saveSettings();
                            textInput.value = '';
                            this.display();
                            new Notice(t('category_created').replace('{0}', value));
                        }
                    });
            });

        this.plugin.settings.categories.forEach(category => {
            const setting = new Setting(containerEl)
                .setName(category)
                .addButton(btn => btn
                    .setClass('netclip_edit')
                    .setIcon('pencil')
                    .setTooltip(t('edit_category') || 'Edit category')
                    .onClick(async () => {
                        await this.openEditCategoryModal(category);
                    }))
                .addButton(btn => btn
                    .setClass('netclip_trash')
                    .setIcon('trash')
                    .onClick(async () => {
                        if (await this.deleteCategory(category)) {
                            this.display();
                        }
                    }))
                .addText(text => {
                    text.setPlaceholder(t('enter_icon_name'))
                        .setValue(this.plugin.settings.categoryIcons[category] || '')
                        .onChange(async (value) => {
                            if (value) {
                                this.plugin.settings.categoryIcons[category] = value;
                            } else {
                                delete this.plugin.settings.categoryIcons[category];
                            }
                            await this.plugin.saveSettings();
                        });
                    return text;
                });

            if (this.plugin.settings.categoryIcons[category]) {
                setting.setDesc(`Current icon: ${this.plugin.settings.categoryIcons[category]}`);
            }
        });
    }


    private homeTab(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName(t('home_tab'))
            .setHeading();

        new Setting(containerEl)
            .setName(t('replace_new_tabs'))
            .setDesc(t('replace_new_tabs_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.replaceTabHome)
                    .onChange(async (value) => {
                        this.plugin.settings.replaceTabHome = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName(t('show_clock'))
            .setDesc(t('show_clock_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showClock)
                    .onChange(async (value) => {
                        this.plugin.settings.showClock = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshHomeViews();
                    });
            });

        new Setting(containerEl)
            .setName(t('show_recent_files'))
            .setDesc(t('show_recent_files_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.homeTab.showRecentFiles)
                    .onChange(async (value) => {
                        this.plugin.settings.homeTab.showRecentFiles = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshHomeViews();
                    });
            });

        new Setting(containerEl)
            .setName(t('show_saved_articles'))
            .setDesc(t('show_saved_articles_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.homeTab.showSavedArticles)
                    .onChange(async (value) => {
                        this.plugin.settings.homeTab.showSavedArticles = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshHomeViews();
                    });
            });

        new Setting(containerEl)
            .setName('Background Image')
            .setDesc('Set a background image for the home tab (enter image URL)')
            .addText(text => text
                .setPlaceholder('Enter image URL')
                .setValue(this.plugin.settings.homeTab.backgroundImage)
                .onChange(async (value) => {
                    this.plugin.settings.homeTab.backgroundImage = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHomeViews();
                }))
            .addButton(button => button
                .setButtonText('Clear')
                .onClick(async () => {
                    this.plugin.settings.homeTab.backgroundImage = '';
                    await this.plugin.saveSettings();
                    this.plugin.refreshHomeViews();
                }))
            .addButton(button => button
                .setButtonText('Test')
                .onClick(() => {
                    const url = this.plugin.settings.homeTab.backgroundImage;
                    if (url) {
                        const img = new Image();
                        img.onload = () => {
                            new Notice('Background image loaded successfully');
                        };
                        img.onerror = () => {
                            new Notice('Failed to load background image. Please check the URL');
                        };
                        img.src = url;
                    }
                }));

        new Setting(containerEl)
            .setName('Background Blur')
            .setDesc('Adjust the blur intensity of the background image (0-20)')
            .addSlider(slider => slider
                .setLimits(0, 20, 1)
                .setValue(this.plugin.settings.homeTab.backgroundBlur)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.homeTab.backgroundBlur = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHomeViews();
                }));

        new Setting(containerEl)
            .setName('Text Color')
            .setDesc('Choose the text color when background image is set')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.homeTab.textColor)
                .onChange(async (value) => {
                    this.plugin.settings.homeTab.textColor = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHomeViews();
                }));

        new Setting(containerEl)
            .setName('Text Brightness')
            .setDesc('Adjust the brightness of the text (0-100%)')
            .addSlider(slider => slider
                .setLimits(0, 100, 5)
                .setValue(this.plugin.settings.homeTab.textBrightness)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.homeTab.textBrightness = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHomeViews();
                }));
    }


    private aiTab(containerEl: HTMLElement) {
        new Setting(containerEl).setName('AI prompts').setHeading();

        new Setting(containerEl)
            .setName(t('enable_ai'))
            .setDesc(t('enable_ai_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAI)
                .onChange(async (value) => {
                    this.plugin.settings.enableAI = value;
                    await this.plugin.saveSettings();
                    containerEl.empty();
                    this.aiTab(containerEl);
                })
            );

        new Setting(containerEl)
            .setName(t('gemini_api_key'))
            .setDesc(t('gemini_api_key_desc'))
            .addText(text => text
                .setPlaceholder(t('enter_api_key'))
                .setValue(this.plugin.settings.geminiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.geminiApiKey = value;
                    if (value) {
                        this.plugin.geminiService = new GeminiService(value, this.plugin.settings);
                    } else {
                        this.plugin.geminiService = null;
                    }
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Gemini Model')
            .setDesc('Select which Gemini model to use for AI processing')
            .addDropdown(dropdown => dropdown
                .addOption('gemini-2.5-pro', 'Gemini 2.5 Pro')
                .addOption('gemini-flash-latest', 'Gemini Flash Latest')
                .addOption('gemini-flash-lite-latest', 'Gemini Flash Lite Latest')
                .addOption('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite')
                .setValue(this.plugin.settings.geminiModel)
                .onChange(async (value: 'gemini-2.5-pro' | 'gemini-flash-latest' | 'gemini-flash-lite-latest' | 'gemini-2.5-flash-lite') => {
                    this.plugin.settings.geminiModel = value;
                    await this.plugin.saveSettings();
                }));

        const infoDiv = containerEl.createDiv('netclip-info-box');
        const infoContent = infoDiv.createDiv('netclip-info-content');

        const infoIcon = infoContent.createSpan('netclip-info-icon');
        setIcon(infoIcon, 'info');

        const textSpan = infoContent.createSpan();
        textSpan.setText('Learn how to create and use AI prompts effectively');

        const detailsLink = infoContent.createEl('a', {
            text: 'View Documentation →',
            href: 'https://github.com/Elhary/Obsidian-NetClip/blob/main/AI_PROMPTS.md'
        });
        detailsLink.addClass('netclip-details-link');
        detailsLink.setAttribute('target', '_blank');

        if (this.plugin.settings.enableAI) {
            new Setting(containerEl)
                .setName(t('ai_prompts'))
                .setDesc(t('ai_prompts_desc'))
                .addButton(button => button
                    .setButtonText(t('add_new_prompt'))
                    .setCta()
                    .onClick(() => {
                        const newPrompt: AIPrompt = {
                            name: '',
                            prompt: '',
                            enabled: false,
                            variables: {}
                        };
                        new PromptModal(this.app, newPrompt, async (prompt) => {
                            this.plugin.settings.prompts.push(prompt);
                            await this.plugin.saveSettings();
                            this.display();
                        }).open();
                    }));

            new Setting(containerEl)
                .setName(t('export_prompts'))
                .setDesc(t('export_prompts_desc'))
                .addButton(button => button
                    .setButtonText(t('export_prompts'))
                    .onClick(() => this.exportPrompts(this.plugin.settings.prompts)));

            new Setting(containerEl)
                .setName(t('import_prompts'))
                .setDesc(t('import_prompts_desc'))
                .addButton(button => button
                    .setButtonText(t('import_prompts'))
                    .onClick(() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.json';
                        input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                                try {
                                    const text = await file.text();
                                    const prompts = JSON.parse(text);

                                    // Validate the imported data
                                    if (!Array.isArray(prompts) || !prompts.every(p =>
                                        typeof p === 'object' &&
                                        typeof p.name === 'string' &&
                                        typeof p.prompt === 'string' &&
                                        typeof p.enabled === 'boolean' &&
                                        typeof p.variables === 'object'
                                    )) {
                                        throw new Error('Invalid format');
                                    }

                                    this.plugin.settings.prompts = prompts;
                                    await this.plugin.saveSettings();
                                    new Notice(t('import_success'));
                                    this.display();
                                } catch (error) {
                                    new Notice(t('import_error'));
                                }
                            }
                        };
                        input.click();
                    }));

            this.plugin.settings.prompts.forEach((prompt, index) => {
                new Setting(containerEl)
                    .setName(prompt.name)
                    .addToggle(toggle => toggle
                        .setTooltip(prompt.enabled ? t('hide_in_clipper_desc') : t('show_in_clipper_desc'))
                        .setValue(prompt.enabled)
                        .onChange(async (value) => {
                            this.plugin.settings.prompts[index].enabled = value;
                            await this.plugin.saveSettings();
                            this.display();
                        }))
                    .addButton(button => button
                        .setButtonText(t('edit_prompt'))
                        .onClick(() => {
                            new PromptModal(this.app, prompt, async (updatedPrompt) => {
                                this.plugin.settings.prompts[index] = updatedPrompt;
                                await this.plugin.saveSettings();
                                this.display();
                            }).open();
                        }))
                    .addButton(button => button
                        .setButtonText(t('export_prompt'))
                        .setTooltip(t('export_single_prompt_desc'))
                        .onClick(() => this.exportPrompts([prompt], prompt.name)))
                    .addButton(button => button
                        .setButtonText(t('delete_prompt'))
                        .onClick(async () => {
                            const modal = new Modal(this.app);
                            modal.titleEl.setText('Delete Prompt');
                            modal.contentEl.createDiv().setText(`Are you sure you want to delete the prompt "${prompt.name}"?`);

                            new Setting(modal.contentEl)
                                .addButton(btn => btn
                                    .setButtonText('Cancel')
                                    .onClick(() => {
                                        modal.close();
                                    }))
                                .addButton(btn => btn
                                    .setButtonText('Delete')
                                    .setWarning()
                                    .onClick(async () => {
                                        this.plugin.settings.prompts.splice(index, 1);
                                        await this.plugin.saveSettings();
                                        this.display();
                                        modal.close();
                                    }));

                            modal.open();
                        }));
            });
        }
    }

    private exportPrompts(prompts: AIPrompt[], filename?: string) {
        const promptsJson = JSON.stringify(prompts, null, 2);
        const blob = new Blob([promptsJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename ? `netclip-prompt-${filename}.json` : 'netclip-prompts.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private supportTab(containerEl: HTMLElement) {
        new Setting(containerEl).setName(t('support_tab')).setHeading();

        new Setting(containerEl)
            .setName(t('support_development'))
            .setDesc(t('support_development_desc'))
            .setClass('netclip-support-buttons');

        const buttonsContainer = containerEl.createDiv('netclip-support-buttons-container');

        const githubContainer = buttonsContainer.createDiv('netclip-support-button');
        const githubLink = githubContainer.createEl('a', {
            href: 'https://github.com/Elhary/Obsidian-NetClip'
        });

        githubLink.setAttribute('target', '_blank');
        githubLink.createEl('img', {
            attr: {
                src: 'https://img.shields.io/github/stars/Elhary/Obsidian-NetClip?style=social',
                alt: t('github_repo'),
                height: '40'
            }
        });
    }
}