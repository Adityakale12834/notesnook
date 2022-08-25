import type {
  Attachment,
  AttachmentProgress
} from '@streetwriters/editor/dist/es/extensions/attachment/index';
import type { ImageAttributes } from '@streetwriters/editor/dist/es/extensions/image/index';
import { createRef, RefObject } from 'react';
import { Platform } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { db } from '../../../common/database';
import { sleep } from '../../../utils/time';
import { NoteType } from '../../../utils/types';
import { Settings } from './types';
import { getResponse, randId, textInput } from './utils';

type Action = { job: string; id: string };

async function call(webview: RefObject<WebView | undefined>, action?: Action) {
  if (!webview.current || !action) return;
  setImmediate(() => webview.current?.injectJavaScript(action.job));
  let response = await getResponse(action.id);
  console.log('webview job: ', action.id, response ? response.value : response);
  if (!response) {
    console.warn('webview job failed', action.id);
  }
  return response ? response.value : response;
}

const fn = (fn: string) => {
  let id = randId('fn_');
  return {
    job: `(async () => {
      try {
        let response = true;
        ${fn}
        post("${id}",response);
      } catch(e) {
        const DEV_MODE = ${__DEV__};
        if (DEV_MODE && typeof logger !== "undefined") logger('error', "webview: ", e.message, e.stack);
      }
      return true;
    })();`,
    id: id
  };
};

class Commands {
  ref = createRef<WebView | undefined>();
  previousSettings: Partial<Settings> | null;
  constructor(ref: RefObject<WebView>) {
    this.ref = ref;
    this.previousSettings = null;
  }

  async doAsync<T>(job: string) {
    if (!this.ref.current) return false;
    return call(this.ref, fn(job)) as Promise<T>;
  }

  focus = async () => {
    if (!this.ref.current) return;
    if (Platform.OS === 'android') {
      //this.ref.current?.requestFocus();
      setTimeout(async () => {
        if (!this.ref) return;
        textInput.current?.focus();
        await this.doAsync(`editor.commands.focus()`);
        this.ref?.current?.requestFocus();
      }, 1);
    } else {
      await sleep(200);
      await this.doAsync(`editor.commands.focus()`);
    }
  };

  blur = async () =>
    await this.doAsync(`
  editor && editor.commands.blur();
  typeof globalThis.editorTitle !== "undefined" && editorTitle.current && editorTitle.current.blur();
  `);

  clearContent = async () => {
    this.previousSettings = null;
    await this.doAsync(
      `editor.commands.blur();
typeof globalThis.editorTitle !== "undefined" && editorTitle.current && editorTitle.current?.blur();
if (editorController.content) editorController.content.current = null;
editorController.onUpdate();
editorController.setTitle(null);
typeof globalThis.statusBar !== "undefined" && statusBar.current.set({date:"",saved:""});
        `
    );
  };

  setSessionId = async (id: string | null) => await this.doAsync(`globalThis.sessionId = "${id}"`);

  setStatus = async (date: string | undefined, saved: string) =>
    await this.doAsync(
      `typeof globalThis.statusBar !== "undefined" && statusBar.current.set({date:"${date}",saved:"${saved}"})`
    );

  setPlaceholder = async (placeholder: string) => {
    await this.doAsync(`
    const element = document.querySelector(".is-editor-empty");
    if (element) {
      element.setAttribute("data-placeholder","${placeholder}");
    }
    `);
  };

  setInsets = async (insets: EdgeInsets) => {
    logger.info('setInsets', insets);
    await this.doAsync(`
      if (typeof safeAreaController !== "undefined") {
        safeAreaController.update(${JSON.stringify(insets)}) 
      }
    `);
  };

  updateSettings = async (settings?: Partial<Settings>) => {
    if (!this.previousSettings) return;
    this.previousSettings = {
      ...this.previousSettings,
      ...settings
    };
    await this.doAsync(`
      if (typeof globalThis.settingsController !== "undefined") {
        globalThis.settingsController.update(${JSON.stringify(this.previousSettings)}) 
      }
    `);
  };

  setSettings = async (settings?: Partial<Settings>) => {
    if (settings) {
      this.previousSettings = settings;
    } else {
      if (this.previousSettings) {
        settings = this.previousSettings;
      } else {
        return;
      }
    }
    console.log('setSettings', JSON.stringify(settings));
    await this.doAsync(`
      if (typeof globalThis.settingsController !== "undefined") {
        globalThis.settingsController.update(${JSON.stringify(settings)}) 
      }
    `);
  };

  setTags = async (note: NoteType | null | undefined) => {
    if (!note) return;
    let tags = !note.tags
      ? []
      : note.tags
          .map((t: any) =>
            db.tags?.tag(t) ? { title: db.tags.tag(t).title, alias: db.tags.tag(t).alias } : null
          )
          .filter((t: any) => t !== null);
    await this.doAsync(`
    if (typeof editorTags !== "undefined" && editorTags.current) {
      editorTags.current.setTags(${JSON.stringify(tags)});
    }
  `);
  };

  clearTags = async () => {
    await this.doAsync(`
    if (typeof editorTags !== "undefined" && editorTags.current) {
      editorTags.current.setTags([]);
    }
  `);
  };

  insertAttachment = async (attachment: Attachment) => {
    await this.doAsync(`editor && editor.commands.insertAttachment(${JSON.stringify(attachment)})`);
  };

  setAttachmentProgress = async (attachmentProgress: AttachmentProgress) => {
    await this.doAsync(
      `editor && editor.commands.setAttachmentProgress(${JSON.stringify(attachmentProgress)})`
    );
  };

  insertImage = async (image: ImageAttributes) => {
    console.log('image data', image);
    await this.doAsync(`editor && editor.commands.insertImage(${JSON.stringify(image)})`);
  };

  updateImage = async ({ src, hash }: ImageAttributes) => {
    await this.doAsync(
      `editor && editor.commands.updateImage(${JSON.stringify({
        hash
      })},${JSON.stringify({ src, hash, preventUpdate: true })})`
    );
  };

  handleBack = async () => {
    return this.doAsync<boolean>(
      `response = window.dispatchEvent(new Event("handleBackPress",{cancelable:true}));`
    );
  };
  //todo add replace image function
}

export default Commands;
