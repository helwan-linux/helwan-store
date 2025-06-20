// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose APIs to the renderer process safely
contextBridge.exposeInMainWorld('api', {
    /**
     * Invokes a general shell command in the main process.
     * @param {string} command - The command string.
     * @returns {Promise<Object>} - The result of the command execution.
     */
    runCommand: (command) => ipcRenderer.invoke('run-command', command),

    /**
     * Fetches all packages from Arch and AUR repositories.
     * @returns {Promise<Object>} - An object containing success status and package list.
     */
    fetchAllPackages: () => ipcRenderer.invoke('fetch-all-packages'),

    /**
     * Installs a specified package.
     * @param {Object} pkgInfo - Object containing packageName, packageSource, and optional command.
     * @returns {Promise<Object>} - The result of the installation.
     */
    installPackage: (pkgInfo) => ipcRenderer.invoke('install-package', pkgInfo),

    /**
     * Removes a specified package.
     * @param {Object} pkgInfo - Object containing packageName, packageSource, and optional command.
     * @returns {Promise<Object>} - The result of the removal.
     */
    removePackage: (pkgInfo) => ipcRenderer.invoke('remove-package', pkgInfo),

    /**
     * Checks for available system updates.
     * @returns {Promise<Object>} - Object indicating update availability and count.
     */
    checkForSystemUpdates: () => ipcRenderer.invoke('check-for-system-updates'),

    /**
     * Synchronizes package databases (pacman -Syy).
     * @returns {Promise<Object>} - The result of the synchronization.
     */
    syncPackageDatabases: () => ipcRenderer.invoke('sync-package-databases'),

    /**
     * Performs a full system update (pacman -Syu).
     * This is the function that was reported as 'not a function'.
     * @returns {Promise<Object>} - The result of the system update.
     */
    updateSystem: () => ipcRenderer.invoke('update-system'), // <--- تأكد من وجود هذا السطر بالضبط

    /**
     * Sends a desktop notification.
     * @param {Object} notificationOptions - Object containing title, body, and iconPath.
     */
    sendNotification: (notificationOptions) => ipcRenderer.invoke('send-notification', notificationOptions),

    /**
     * Listens for action status updates from the main process (e.g., install/remove/update progress).
     * @param {Function} callback - The callback function to execute when a status update is received.
     */
    onActionStatus: (callback) => ipcRenderer.on('action-status', (event, ...args) => callback(...args))
});

