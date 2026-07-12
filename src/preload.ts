import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  chat: (message: string, mode: string, context?: string, model?: string, streamId?: string) =>
    ipcRenderer.invoke('chat', { message, mode, context, model, streamId }),

  onChatChunk: (cb: (data: { streamId: string; delta: string }) => void) => {
    const handler = (_event: any, data: any) => cb(data);
    ipcRenderer.on('chat:chunk', handler);
    return () => ipcRenderer.removeListener('chat:chunk', handler);
  },

  getModels: () => ipcRenderer.invoke('get-models'),

  models: {
    pull: (name: string) => ipcRenderer.invoke('models:pull', { name }),
    delete: (name: string) => ipcRenderer.invoke('models:delete', { name }),
    onProgress: (cb: (data: any) => void) => {
      const handler = (_event: any, data: any) => cb(data);
      ipcRenderer.on('models:pull-progress', handler);
      return () => ipcRenderer.removeListener('models:pull-progress', handler);
    }
  },

  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    save: (notes: any[]) => ipcRenderer.invoke('notes:save', notes)
  },

  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    save: (tasks: any[]) => ipcRenderer.invoke('tasks:save', tasks)
  },

  memory: {
    list: () => ipcRenderer.invoke('memory:list'),
    save: (items: string[]) => ipcRenderer.invoke('memory:save', items)
  },

  history: {
    list: () => ipcRenderer.invoke('history:list'),
    save: (data: Record<string, any[]>) => ipcRenderer.invoke('history:save', data)
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (s: any) => ipcRenderer.invoke('settings:save', s)
  },

  files: {
    open: () => ipcRenderer.invoke('files:open')
  },

  recon: {
    tools: () => ipcRenderer.invoke('recon:tools'),
    run: (toolId: string, target: string, runId: string) => ipcRenderer.invoke('recon:run', { toolId, target, runId }),
    hash: (filePath: string) => ipcRenderer.invoke('recon:hash', { filePath }),
    pickFile: () => ipcRenderer.invoke('recon:pick-file'),
    onOutput: (cb: (data: { runId: string; chunk: string; done: boolean }) => void) => {
      const handler = (_event: any, data: any) => cb(data);
      ipcRenderer.on('recon:output', handler);
      return () => ipcRenderer.removeListener('recon:output', handler);
    }
  }
});

declare global {
  interface Window {
    api: {
      chat: (message: string, mode: string, context?: string, model?: string, streamId?: string) => Promise<any>;
      onChatChunk: (cb: (data: { streamId: string; delta: string }) => void) => () => void;
      getModels: () => Promise<any>;
      models: {
        pull: (name: string) => Promise<any>;
        delete: (name: string) => Promise<any>;
        onProgress: (cb: (data: any) => void) => () => void;
      };
      notes: { list: () => Promise<any[]>; save: (notes: any[]) => Promise<boolean> };
      tasks: { list: () => Promise<any[]>; save: (tasks: any[]) => Promise<boolean> };
      memory: { list: () => Promise<string[]>; save: (items: string[]) => Promise<boolean> };
      history: { list: () => Promise<Record<string, any[]>>; save: (data: Record<string, any[]>) => Promise<boolean> };
      settings: { get: () => Promise<any>; save: (s: any) => Promise<boolean> };
      files: { open: () => Promise<any> };
      recon: {
        tools: () => Promise<any[]>;
        run: (toolId: string, target: string, runId: string) => Promise<any>;
        hash: (filePath: string) => Promise<any>;
        pickFile: () => Promise<any>;
        onOutput: (cb: (data: { runId: string; chunk: string; done: boolean }) => void) => () => void;
      };
    };
  }
}
