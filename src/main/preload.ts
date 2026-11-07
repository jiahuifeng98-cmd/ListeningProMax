import { contextBridge, ipcRenderer, webUtils } from 'electron';
contextBridge.exposeInMainWorld('api', {
  call: (method: string, args: unknown) => ipcRenderer.invoke('lpm', method, args),
  filePath: (file: File) => webUtils.getPathForFile(file),
  onChange: (cb: (event: unknown) => void) => { const listener = (_: unknown, event: unknown) => cb(event); ipcRenderer.on('change', listener); return () => ipcRenderer.removeListener('change', listener); }
});
