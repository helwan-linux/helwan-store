// main.js

const { app, BrowserWindow, ipcMain, Notification, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let tray = null; 
let appQuitting = false; 

/**
 * Creates the main browser window for the application.
 */
function createWindow() {
    
    // 💥 CORE STEP: Disables the main application menu (File, Edit, etc.)
    Menu.setApplicationMenu(null); 
    
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        // Application icon
        icon: path.join(__dirname, 'assets', 'icons', 'app_icon.png'),
        show: false // Don't show the window immediately
    });

    // Load the main HTML file
    win.loadFile('src/index.html');
    // win.webContents.openDevTools();

    // Event handler when trying to close the window
    win.on('close', (event) => {
        if (!appQuitting) { 
            event.preventDefault(); // Prevent default close action
            win.hide(); // Hide the window instead
        }
    });

    // Show the window only when ready (and not set to start hidden)
    win.once('ready-to-show', () => {
        const shouldStartHidden = process.argv.includes('--start-hidden');
        if (!shouldStartHidden) {
            win.show();
        }
    });

    return win; 
}

// Event handler: Called when Electron is ready to create browser windows.
app.whenReady().then(() => {
    const shouldStartHidden = process.argv.includes('--start-hidden');

    // Create the main window
    const mainWindow = createWindow(); 

    // Create Tray icon
    tray = new Tray(path.join(__dirname, 'assets', 'icons', 'app_icon.png')); 

    // Context menu for the Tray icon
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open',
            click: () => {
                mainWindow.show(); 
            }
        },
        {
            label: 'Hide', 
            click: () => {
                mainWindow.hide();
            }
        },
        {
            label: 'Check Update',
            click: async () => {
                const result = await ipcMain.handle('check-for-system-updates');
                if (result.success) {
                    new Notification({
                        title: 'System Update',
                        body: result.updatesAvailable ? `${result.updateCount} system update available!` : 'System is up-to-date.',
                        icon: path.join(__dirname, 'assets', 'icons', 'app_icon.png')
                    }).show();
                } else {
                    new Notification({
                        title: 'Error',
                        body: 'Failed to check for updates: ' + (result.message || 'Unknown error'),
                        icon: path.join(__dirname, 'assets', 'icons', 'app_icon.png')
                    }).show();
                }
            }
        },
        { type: 'separator' }, 
        {
            label: 'Quit',
            click: () => {
                appQuitting = true; 
                app.quit(); 
            }
        }
    ]);

    tray.setToolTip('Helwan Store'); 
    tray.setContextMenu(contextMenu); 

    // Double-click handler for the Tray icon (Show/Hide window)
    tray.on('double-click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
        }
    });

    // Event handler: Re-create a window if all windows are closed and the app is activated (e.g., clicking dock icon on macOS).
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Set appQuitting flag before the app closes entirely
app.on('before-quit', () => {
    appQuitting = true;
});

// Event handler: Called when all windows are closed.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !appQuitting) {
        // Keep app running in tray on Windows/Linux if not explicitly quitting
    } else if (process.platform === 'darwin' && appQuitting) {
          app.quit(); // Explicitly quit on macOS if requested
    }
});

/**
 * Runs a general shell command (non-privileged).
 * @param {string} command - The shell command to execute.
 * @returns {Promise<{success: boolean, output?: string, message?: string}>} - Result of the command execution.
 */
async function runShellCommand(command) {
    return new Promise((resolve) => {
        const child = spawn(command, { shell: true });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('error', (error) => {
            console.error(`Spawn error for command "${command}": ${error.message}`);
            resolve({ success: false, message: `Command execution failed: ${error.message}` });
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`Command "${command}" exited with code ${code}: ${stderr}`);
                resolve({ success: false, message: stderr || `Command exited with non-zero code ${code}` });
            } else {
                resolve({ success: true, output: stdout });
            }
        });
    });
}

// IPC handler: Allows renderer process to run general shell commands.
ipcMain.handle('run-command', async (event, command) => {
    return runShellCommand(command);
});

/**
 * Fetches all available packages from Arch repositories (via pacman) and AUR (via yay).
 * @returns {Promise<{success: boolean, packages?: Array<Object>, message?: string}>} - A promise resolving to an object containing success status, and a list of packages if successful.
 */
ipcMain.handle('fetch-all-packages', async () => {
    console.log('Fetching all packages...');
    const pacmanPromise = runShellCommand('pacman -Sl');
    const yayPromise = runShellCommand('yay -Sl'); 

    const [pacmanResult, yayResult] = await Promise.all([pacmanPromise, yayPromise]);

    const allPackages = [];

    // Process pacman output
    if (pacmanResult.success && pacmanResult.output) {
        console.log('Pacman output received.');
        const pacmanLines = pacmanResult.output.split('\n').filter(Boolean);
        pacmanLines.forEach(line => {
            const match = line.match(/^(\S+)\s+(\S+)\s+([^\[]+)(\[installed\])?/);
            if (match) {
                const [_, repo, name, version, installedFlag] = match;
                allPackages.push({
                    source: 'Arch', 
                    repo,
                    name,
                    version: version.trim(),
                    installed: !!installedFlag 
                });
            }
        });
        console.log(`Parsed ${pacmanLines.length} pacman lines.`);
    } else {
        console.warn('Failed to fetch pacman packages:', pacmanResult.message);
    }

    // Process yay output
    if (yayResult.success && yayResult.output) {
        console.log('Yay output received.');
        const yayLines = yayResult.output.split('\n').filter(Boolean);
        yayLines.forEach(line => {
            let match = line.match(/^aur\s+(\S+)\s+([^\[]+)(\[installed\])?/);
            if (match) {
                const [_, name, version, installedFlag] = match;
                allPackages.push({
                    source: 'AUR', 
                    repo: 'aur', 
                    name,
                    version: version.trim(),
                    installed: !!installedFlag
                });
            } else {
                match = line.match(/^(\S+)\/(\S+)\s+([^\[]+)(\[installed\])?/);
                if (match) {
                    const [_, repo, name, version, installedFlag] = match;
                    if (repo !== 'aur') { 
                        allPackages.push({
                            source: 'Arch', 
                            repo,
                            name,
                            version: version.trim(),
                            installed: !!installedFlag
                        });
                    }
                }
            }
        });
        console.log(`Parsed ${yayLines.length} yay lines.`);
    } else {
        console.warn('Failed to fetch AUR packages (yay might not be installed or command failed):', yayResult.message);
    }

    const uniquePackagesMap = new Map();
    allPackages.forEach(pkg => {
        if (!uniquePackagesMap.has(pkg.name)) {
            uniquePackagesMap.set(pkg.name, pkg);
        }
    });

    const finalPackages = Array.from(uniquePackagesMap.values());
    console.log(`Total unique packages found: ${finalPackages.length}`);
    return { success: true, packages: finalPackages };
});


/**
 * Executes a privileged command using sudo in a new terminal window.
 * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {string} command - The command to execute with sudo.
 * @param {string} packageName - The name of the package associated with the command (for feedback).
 * @returns {Promise<{success: boolean, message?: string}>} - Result of the command execution.
 */
async function executePrivilegedCommand(event, command, packageName) {
    return new Promise((resolve) => {
        event.sender.send('action-status', { type: 'started', packageName: packageName, command: command });

        const terminalCommand = `xterm -e "sudo ${command} --noconfirm; echo 'Press Enter to close...'; read"`;
        console.log(`Attempting to execute privileged command via terminal: ${terminalCommand}`);

        const child = spawn(terminalCommand, { shell: true });
        let stdoutBuffer = '';
        let stderrBuffer = '';

        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdoutBuffer += chunk;
            event.sender.send('action-status', { type: 'progress', packageName: packageName, output: chunk });

            const lines = stdoutBuffer.split('\n');
            lines.forEach(line => {
                if (line.includes('[') && line.includes('/')) {
                    const match = line.match(/\[(\d+)\/(\d+)\]/);
                    if (match) {
                        const current = parseInt(match[1]);
                        const total = parseInt(match[2]);
                        const percentage = Math.round((current / total) * 100);
                        event.sender.send('action-status', { type: 'percentage', packageName: packageName, percentage: percentage });
                    }
                } else if (line.includes('Total Download Size:') || line.includes('Total Installed Size:')) {
                    event.sender.send('action-status', { type: 'message', packageName: packageName, message: line });
                }
            });
            stdoutBuffer = lines[lines.length - 1];
        });

        child.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderrBuffer += chunk;
            event.sender.send('action-status', { type: 'progress', packageName: packageName, output: chunk, isError: true });
        });

        child.on('error', (error) => {
            console.error(`Spawn error for privileged command "${terminalCommand}": ${error.message}`);
            event.sender.send('action-status', { type: 'failed', packageName: packageName, message: `Command execution failed: ${error.message}` });
            resolve({ success: false, message: `Command execution failed: ${error.message}` });
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`Privileged command "${terminalCommand}" exited with code ${code}: ${stderrBuffer}`);
                event.sender.send('action-status', { type: 'failed', packageName: packageName, message: stderrBuffer || `Command exited with non-zero code ${code}` });
                resolve({ success: false, message: stderrBuffer || `Command exited with non-zero code ${code}` });
            } else {
                console.log(`Privileged command success for ${packageName}: ${stdoutBuffer}`);
                event.sender.send('action-status', { type: 'completed', packageName: packageName, message: 'Operation completed successfully!' });
                resolve({ success: true, message: `Operation completed successfully for ${packageName}.` });
            }
        });
    });
}

// IPC handler: Installs a package.
ipcMain.handle('install-package', (event, { packageName, packageSource, command }) => {
    let finalCommand = command; 
    if (!finalCommand) {
        if (packageSource === 'AUR') {
            finalCommand = `yay -S ${packageName}`; 
        } else {
            finalCommand = `pacman -S ${packageName}`; 
        }
    }
    return executePrivilegedCommand(event, finalCommand, packageName);
});

// IPC handler: Removes a package.
ipcMain.handle('remove-package', (event, { packageName, packageSource, command }) => {
    let finalCommand = command; 
    if (!finalCommand) {
        if (packageSource === 'AUR') {
            finalCommand = `yay -R ${packageName}`; 
        } else {
            finalCommand = `pacman -R ${packageName}`; 
        }
    }
    return executePrivilegedCommand(event, finalCommand, packageName);
});

/**
 * Checks for available system updates using 'pacman -Qu'.
 * Also sends a desktop notification if updates are found.
 * @returns {Promise<{success: boolean, updatesAvailable?: boolean, updateCount?: number, updateList?: string[], message?: string}>} - Result of the update check.
 */
ipcMain.handle('check-for-system-updates', async () => {
    try {
        const result = await runShellCommand('pacman -Qu'); 

        if (result.success && result.output) {
            const updates = result.output.split('\n').filter(line => line.trim() !== '');
            if (updates.length > 0) {
                if (Notification.isSupported()) {
                    new Notification({
                        title: 'Helwan Store',
                        body: `${updates.length} system updates available!`,
                        icon: path.join(__dirname, 'assets', 'icons', 'app_icon.png')
                    }).show();
                }
                return { success: true, updatesAvailable: true, updateCount: updates.length, updateList: updates };
            } else {
                return { success: true, updatesAvailable: false, updateCount: 0, message: 'Your system is up-to-date.' };
            }
        } else {
            console.error('Failed to query upgradable packages:', result.message);
            return { success: true, updatesAvailable: false, updateCount: 0, message: result.message || 'Failed to check for updates (might be old database or command failed).' };
        }
    } catch (error) {
        console.error('Error checking for system updates:', error);
        return { success: false, message: error.message || 'An unexpected error occurred while checking for updates.' };
    }
});

/**
 * NEW IPC Handler: Synchronizes pacman databases (`sudo pacman -Syy`).
 */
ipcMain.handle('sync-package-databases', async (event) => {
    console.log('Synchronizing package databases (sudo pacman -Syy)...');
    const command = 'pacman -Syy';
    return executePrivilegedCommand(event, command, 'System Database Sync');
});

/**
 * NEW IPC Handler: Performs a full system update (`sudo pacman -Syu`).
 */
ipcMain.handle('update-system', async (event) => {
    console.log('Performing full system update (sudo pacman -Syu)...');
    const command = 'pacman -Syu';
    const result = await executePrivilegedCommand(event, command, 'System Update'); 

    if (result.success) {
        if (Notification.isSupported()) {
            new Notification({
                title: 'Helwan Store',
                body: 'System update completed successfully!',
                icon: path.join(__dirname, 'assets', 'icons', 'app_icon.png')
            }).show();
        }
    } else {
        if (Notification.isSupported()) {
            new Notification({
                title: 'Helwan Store - Error',
                body: 'System update failed: ' + (result.message || 'Unknown error'),
                icon: path.join(__dirname, 'assets', 'icons', 'app_icon.png')
            }).show();
        }
    }
    
    return result; 
});


// IPC handler: Sends a simple desktop notification from the renderer process.
ipcMain.handle('send-notification', (event, { title, body, iconPath }) => {
    if (Notification.isSupported()) {
        new Notification({
            title: title,
            body: body,
            icon: iconPath ? path.join(__dirname, iconPath) : path.join(__dirname, 'assets', 'icons', 'app_icon.png')
        }).show();
    } else {
        console.warn('Desktop notifications are not supported on this system.');
    }
});
