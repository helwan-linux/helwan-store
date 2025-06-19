// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  runCommand: (cmd) => ipcRenderer.invoke('run-command', cmd),
  fetchAllPackages: () => ipcRenderer.invoke('fetch-all-packages'),
  // Changed: Pass an object { packageName, packageSource }
  installPackage: (packageData) => ipcRenderer.invoke('install-package', packageData),
  removePackage: (packageData) => ipcRenderer.invoke('remove-package', packageData),
  onActionStatus: (callback) => ipcRenderer.on('action-status', (_, status) => callback(status))
});
