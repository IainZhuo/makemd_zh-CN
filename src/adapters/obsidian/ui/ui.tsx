import { EditorView } from "@codemirror/view";
import { InteractionType, ScreenType } from "core/middleware/ui";

import MakeMDPlugin from "main";
import { Sticker, Superstate, UIAdapter, UIManager, i18n } from "makemd-core";
import { Notice, Platform, TFile, getIcon } from "obsidian";
import React, { FC } from "react";

import { Container } from "react-dom";
import { Root, createRoot } from "react-dom/client";
import { emojis } from "schemas/emoji";
import { Pos } from "types/Pos";
import { EmojiData } from "types/emojis";
import { TargetLocation } from "types/path";
import { getParentPathFromString } from "utils/path";
import { urlRegex } from "utils/regex";
import { SPACE_VIEW_TYPE } from "../SpaceViewContainer";
import { getAbstractFileAtPath, getLeaf, openPath } from "../utils/file";
import { openPathInElement } from "../utils/flow/flowEditor";
import { modifyTabSticker } from "../utils/modifyTabSticker";
import { WindowManager } from "./WindowManager";
import { flowIDAnnotation } from "./editors/markdownView/flowEditor/flowStateFields";
import { editableRange } from "./editors/markdownView/flowEditor/selectiveEditor";
import { lucideIcons } from "./icons";
import { showModal } from "./modal";
import { showMainMenu } from "./showMainMenu";
import { stickerFromString } from "./sticker";

export class ObsidianUI implements UIAdapter {
  public manager: UIManager;
  public root: Root;
  public constructor(public plugin: MakeMDPlugin) {
    const newDiv = document.createElement("div");
    document.body.appendChild(newDiv);
    newDiv.className = "mk-root";
    this.createRoot = () => null;
    this.getRoot = () => null;
    this.root = createRoot(newDiv);
    this.root.render(<WindowManager ui={this}></WindowManager>);
  }

  public createRoot: typeof createRoot;
  public getRoot: (container: Container) => Root;

  public availableViews = () => {
    //@ts-ignore
    return Object.keys(this.plugin.app.viewRegistry.typeByExtension);
  };

  public quickOpen = (superstate: Superstate) => {
    this.plugin.quickOpen(superstate);
  };
  public mainMenu = (el: HTMLElement, superstate: Superstate) => {
    showMainMenu(el, superstate, this.plugin.app);
  };
  public onMetadataRefresh = () => {
    modifyTabSticker(this.plugin);
  };
  public navigationHistory = () => {
    return this.plugin.app.workspace.getLastOpenFiles();
  };
  public getSticker = (icon: string) => {
    return stickerFromString(icon, this.plugin);
  };

  public getOS = () => {
    return Platform.isMacOS
      ? "mac"
      : Platform.isWin
      ? "windows"
      : Platform.isLinux
      ? "linux"
      : Platform.isIosApp
      ? "ios"
      : Platform.isAndroidApp
      ? "android"
      : "unknown";
  };
  public openToast = (content: string) => {
    new Notice(content);
  };
  public openPalette = (
    modal: React.FC<{ hide: () => void }>,
    win: Window,
    className: string
  ) => {
    return showModal({
      ui: this,
      fc: modal,
      isPalette: true,
      className,
      win,
    });
  };

  public openModal = (
    title: string,
    modal: FC<{ hide: () => void }>,
    win?: Window,
    className?: string,
    props?: any
  ) => {
    return showModal({
      ui: this,
      fc: modal,
      title: title,
      className,
      props,
      win,
    });
  };
  public openPopover = (position: Pos, popover: FC<{ hide: () => void }>) => {};

  public dragStarted = (
    e: React.DragEvent<HTMLDivElement>,
    paths: string[]
  ) => {
    if (paths.length == 0) return;
    if (paths.length == 1) {
      const path = paths[0];
      const file = getAbstractFileAtPath(this.plugin.app, path);
      if (!file) return;
      if (file instanceof TFile) {
        const dragData = this.plugin.app.dragManager.dragFile(
          e.nativeEvent,
          file
        );
        this.plugin.app.dragManager.onDragStart(e.nativeEvent, dragData);
      } else {
        this.plugin.app.dragManager.onDragStart(e.nativeEvent, {
          icon: "lucide-file",
          source: undefined,
          title: file.name,
          type: "file",
          file: file,
        });
        this.plugin.app.dragManager.dragFolder(e.nativeEvent, file, true);
      }
    } else {
      const files = paths
        .map((f) => getAbstractFileAtPath(this.plugin.app, f))
        .filter((f) => f);
      this.plugin.app.dragManager.onDragStart(
        { ...e, doc: document },
        {
          icon: "lucide-files",
          source: undefined,
          title: i18n.labels.filesCount.replace(
            "{$1}",
            files.length.toString()
          ),
          type: "files",
          files: files,
        }
      );

      this.plugin.app.dragManager.dragFiles(
        { ...e, doc: document },
        files,
        true
      );
    }
  };

  public setDragLabel = (label: string) => {
    this.plugin.app.dragManager.setAction(label);
  };

  public dragEnded = (e: React.DragEvent<HTMLDivElement>) => {};

  public allStickers = () => {
    const allLucide: Sticker[] = lucideIcons.map((f) => ({
      name: f,
      type: "lucide",
      keywords: f,
      value: f,
      html: getIcon(f).outerHTML,
    }));
    const allCustom: Sticker[] = [
      ...this.plugin.superstate.iconsCache.keys(),
    ].map((f) => ({
      name: f,
      type: "vault",
      keywords: f,
      value: f,
      html: this.plugin.superstate.iconsCache.get(f),
    }));

    const allEmojis: Sticker[] = Object.keys(emojis as EmojiData).reduce(
      (p, c: string) => [
        ...p,
        ...emojis[c].map((e) => ({
          type: "emoji",
          name: e.n[0],
          value: e.u,
          html: e.u,
        })),
      ],
      []
    );
    return [...allEmojis, ...allCustom, ...allLucide];
  };

  public getUIPath = (path: string, thumbnail?: boolean): string => {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      if (thumbnail) {
        const thumb = this.plugin.superstate.pathsIndex.get(file.path)?.label
          ?.thumbnail;
        if (thumb) {
          return this.getUIPath(thumb);
        }
      }
      return this.plugin.app.vault.getResourcePath(file);
    } else if (path?.match(urlRegex)) {
      return path;
    }
    const returnPath = getParentPathFromString(
      this.plugin.app.vault.getResourcePath(
        this.plugin.app.vault.getRoot() as any
      )
    );
    return `${returnPath}${path}`;
  };
  public viewsByPath = (path: string) => {
    const abstractFile = getAbstractFileAtPath(this.plugin.app, path);
    if (abstractFile instanceof TFile) {
      return this.plugin.app.workspace
        .getLeavesOfType("markdown")
        .filter((f) => {
          return f.view.file?.path == path;
        })
        .map((f) => {
          return {
            path: f.view.file?.path,
            openPath: (path: string) => {
              f.openFile(abstractFile as TFile);
            },
            parent: null,
            children: [],
          };
        });
    } else {
      return this.plugin.app.workspace
        .getLeavesOfType(SPACE_VIEW_TYPE)
        .filter((f) => {
          return f.view.getState().path == path;
        })
        .map((f) => {
          return {
            path: f.view.getState().path,
            openPath: (path: string) => {
              f.setViewState({
                type: SPACE_VIEW_TYPE,
                state: { path: path },
              });
            },
            parent: null,
            children: [],
          };
        });
    }
  };
  public openPath = (
    path: string,
    newLeaf: TargetLocation,
    source?: any,
    props?: Record<string, any>
  ) => {
    if (newLeaf == "system") {
      // @ts-ignore
      this.plugin.app.showInFolder(path);
      return;
    }

    if (newLeaf == "hover") {
      this.plugin.app.workspace.trigger("link-hover", {}, source, path, path);
      return;
    } else if (source) {
      openPathInElement(
        this.plugin,
        this.plugin.app.workspace.getLeaf(), // workspaceLeafForDom(this.plugin.app, source),
        source,
        null,
        async (editor) => {
          const leaf = editor.attachLeaf();
          if (
            this.plugin.app.vault.getAbstractFileByPath(path) instanceof TFile
          ) {
            await leaf.openFile(
              this.plugin.app.vault.getAbstractFileByPath(path) as TFile
            );
          } else {
            await openPath(leaf, path, this.plugin, true);
          }
          if (!props || !leaf.view?.editor) {
            return;
          }

          const view = leaf.view.editor?.cm as EditorView;
          view.dispatch({
            annotations: [flowIDAnnotation.of(props.id)],
          });

          if (props.from && props.to) {
            leaf.view.editor?.cm.dispatch({
              annotations: [editableRange.of([props.from, props.to])],
            });
          }
        }
      );
      return;
    }
    const leaf = getLeaf(this.plugin.app, newLeaf);
    openPath(leaf, path, this.plugin);
  };
  public primaryInteractionType = () => {
    return Platform.isMobile ? InteractionType.Touch : InteractionType.Mouse;
  };
  public getScreenType = () => {
    return Platform.isMobileApp
      ? ScreenType.Phone
      : Platform.isTablet
      ? ScreenType.Tablet
      : ScreenType.Desktop;
  };
}