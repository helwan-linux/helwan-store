// main.js
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let tray = null; // سيتم استخدام هذا المتغير لتخزين كائن الـ Tray
let appQuitting = false; // لمتابعة ما إذا كان التطبيق في طور الإغلاق الكامل

/**
 * Creates the main browser window for the application.
 */
function createWindow() {
	Menu.setApplicationMenu(null); 
	
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            // Preload script for secure communication between renderer and main process
            preload: path.join(__dirname, 'preload.js'),
            // Ensures renderer process cannot access Node.js APIs directly
            contextIsolation: true,
            nodeIntegration: false
        },
        // Application icon
        icon: path.join(__dirname, 'assets', 'icons', 'app_icon.png'),
        show: false // إضافة جديدة: لا تظهر النافذة عند الإنشاء مباشرة
    });

    // Load the main HTML file
    win.loadFile('src/index.html');
    // Uncomment the line below to open DevTools for debugging purposes
    // win.webContents.openDevTools();

    // إضافة جديدة: معالج حدث عند محاولة إغلاق النافذة
    win.on('close', (event) => {
        if (!appQuitting) { // إذا لم يكن التطبيق في طور الإغلاق الكامل
            event.preventDefault(); // منع الإغلاق الافتراضي
            win.hide(); // إخفاء النافذة بدلاً من إغلاقها
        }
    });

    // إضافة جديدة: إظهار النافذة فقط عندما تكون جاهزة للعرض وتكون مرئية (ليست في وضع البدء المخفي)
    win.once('ready-to-show', () => {
        const shouldStartHidden = process.argv.includes('--start-hidden');
        if (!shouldStartHidden) {
            win.show();
        }
    });

    return win; // إضافة جديدة: أعد كائن النافذة ليتم استخدامه لاحقًا
}

// Event handler: Called when Electron is ready to create browser windows.
app.whenReady().then(() => {
    // إضافة جديدة: تحقق من علامة بدء التشغيل المخفي
    const shouldStartHidden = process.argv.includes('--start-hidden');

    // إنشاء النافذة الرئيسية (ستكون مخفية في البداية بسبب show: false في createWindow)
    const mainWindow = createWindow(); // قم بتخزين النافذة في متغير

    // إضافة جديدة: إنشاء أيقونة الـ Tray
    tray = new Tray(path.join(__dirname, 'assets', 'icons', 'app_icon.png')); // استخدم مسار الأيقونة الخاص بك

    // قائمة السياق لأيقونة الـ Tray
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'open',
            click: () => {
                mainWindow.show(); // إظهار النافذة
            }
        },
        {
            label: 'hide', // خيار لإخفاء النافذة إذا كانت ظاهرة
            click: () => {
                mainWindow.hide();
            }
        },
        {
            label: 'check update',
            click: async () => {
                const result = await ipcMain.handle('check-for-system-updates');
                if (result.success) {
                    new Notification({
                        title: 'system update',
                        body: result.updatesAvailable ? `${result.updateCount} system update!` : 'system updated.',
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
        { type: 'separator' }, // فاصل
        {
            label: 'end',
            click: () => {
                appQuitting = true; // تعيين المتغير للإشارة إلى الإغلاق الكامل
                app.quit(); // إغلاق التطبيق بالكامل
            }
        }
    ]);

    tray.setToolTip('Helwan Store'); // النص الذي يظهر عند تمرير الماوس فوق الأيقونة
    tray.setContextMenu(contextMenu); // تعيين قائمة السياق

    // معالج النقر المزدوج على أيقونة الـ Tray (لإظهار/إخفاء النافذة)
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

// إضافة جديدة: معالج لتعيين appQuitting قبل أن يغلق التطبيق بالكامل
app.on('before-quit', () => {
    appQuitting = true;
});

// Event handler: Called when all windows are closed.
app.on('window-all-closed', () => {
    // على macOS، من الشائع أن تظل التطبيقات وشريط القائمة نشطة حتى ينهي المستخدم صراحة باستخدام Cmd + Q
    // لا تستدعي app.quit() هنا إلا إذا كان المستخدم يطلب الإنهاء صراحة
    // إذا كان appQuitting = true، فهذا يعني أن المستخدم طلب الإنهاء من الـ Tray أو Cmd+Q
    if (process.platform !== 'darwin' && !appQuitting) {
        // على الأنظمة الأخرى غير macOS، إذا أغلقت جميع النوافذ ولم يتم طلب الإنهاء، فلا تفعل شيئًا
        // ودع التطبيق يبقى في الـ Tray
    } else if (process.platform === 'darwin' && appQuitting) {
         app.quit(); // على macOS، إذا طلب الإنهاء صراحة، فقم بالإنهاء
    }
});

/**
 * Runs a general shell command (non-privileged).
 * This function is suitable for commands that do not require root privileges.
 * @param {string} command - The shell command to execute.
 * @returns {Promise<{success: boolean, output?: string, message?: string}>} - Result of the command execution.
 */
async function runShellCommand(command) {
    return new Promise((resolve) => {
        // Use { shell: true } to allow execution of shell features like pipes, redirects.
        // Be cautious when using this with untrusted input.
        const child = spawn(command, { shell: true });
        let stdout = '';
        let stderr = '';

        // Collect stdout data
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        // Collect stderr data
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Handle errors during command spawning (e.g., command not found)
        child.on('error', (error) => {
            console.error(`Spawn error for command "${command}": ${error.message}`);
            resolve({ success: false, message: `Command execution failed: ${error.message}` });
        });

        // Handle command process closure
        child.on('close', (code) => {
            if (code !== 0) {
                // Command exited with a non-zero code, indicating an error
                console.error(`Command "${command}" exited with code ${code}: ${stderr}`);
                resolve({ success: false, message: stderr || `Command exited with non-zero code ${code}` });
            } else {
                // Command completed successfully
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
    // Run pacman and yay concurrently to fetch package lists
    const pacmanPromise = runShellCommand('pacman -Sl');
    const yayPromise = runShellCommand('yay -Sl'); // Or 'paru -Sl' if 'paru' is preferred

    const [pacmanResult, yayResult] = await Promise.all([pacmanPromise, yayPromise]);

    const allPackages = [];

    // Process pacman output
    if (pacmanResult.success && pacmanResult.output) {
        console.log('Pacman output received.');
        const pacmanLines = pacmanResult.output.split('\n').filter(Boolean);
        pacmanLines.forEach(line => {
            // Regex to parse pacman -Sl output: "repo_name package_name version [installed]"
            const match = line.match(/^(\S+)\s+(\S+)\s+([^\[]+)(\[installed\])?/);
            if (match) {
                const [_, repo, name, version, installedFlag] = match;
                allPackages.push({
                    source: 'Arch', // Indicate the source is an official Arch repository
                    repo,
                    name,
                    version: version.trim(),
                    installed: !!installedFlag // Convert installedFlag to boolean
                });
            }
        });
        console.log(`Parsed ${pacmanLines.length} pacman lines.`);
    } else {
        console.warn('Failed to fetch pacman packages:', pacmanResult.message);
    }

    // Process yay output (for AUR and potentially other repos)
    if (yayResult.success && yayResult.output) {
        console.log('Yay output received.');
        const yayLines = yayResult.output.split('\n').filter(Boolean);
        yayLines.forEach(line => {
            // Try to match AUR format: "aur package-name version [installed]"
            let match = line.match(/^aur\s+(\S+)\s+([^\[]+)(\[installed\])?/);
            if (match) {
                const [_, name, version, installedFlag] = match;
                allPackages.push({
                    source: 'AUR', // Explicitly mark as AUR
                    repo: 'aur', // Repo for AUR packages
                    name,
                    version: version.trim(),
                    installed: !!installedFlag
                });
            } else {
                // Fallback to standard repo/package-name format (for non-AUR packages listed by yay)
                match = line.match(/^(\S+)\/(\S+)\s+([^\[]+)(\[installed\])?/);
                if (match) {
                    const [_, repo, name, version, installedFlag] = match;
                    if (repo !== 'aur') { // Avoid duplicating if already handled by 'aur ' by mistake
                        allPackages.push({
                            source: 'Arch', // Or other source if yay lists non-AUR repos
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

    // Deduplicate packages based on name. If a package exists in both pacman and yay output,
    // this simple deduplication keeps the first one encountered (often pacman's entry if processed first).
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
 * This is used for operations like installing, removing, or updating packages that require root privileges.
 * Progress updates are sent back to the renderer process.
 * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {string} command - The command to execute with sudo.
 * @param {string} packageName - The name of the package associated with the command (for feedback).
 * @returns {Promise<{success: boolean, message?: string}>} - Result of the command execution.
 */
async function executePrivilegedCommand(event, command, packageName) {
    return new Promise((resolve) => {
        // Send a 'started' status to the renderer
        event.sender.send('action-status', { type: 'started', packageName: packageName, command: command });

        // Use 'xterm -e' or 'gnome-terminal --' or 'konsole -e' etc. to open a new terminal for sudo password.
        // We are using 'xterm' as a common default. If 'xterm' is not installed, the user might need to change this
        // to their preferred terminal emulator (e.g., 'gnome-terminal', 'konsole', 'kitty', 'alacritty').
        // The 'read' command at the end keeps the terminal window open until the user presses Enter,
        // allowing them to see the output and any potential errors.
        const terminalCommand = `xterm -e "sudo ${command} --noconfirm; echo 'Press Enter to close...'; read"`;
        console.log(`Attempting to execute privileged command via terminal: ${terminalCommand}`);

        const child = spawn(terminalCommand, { shell: true });
        let stdoutBuffer = '';
        let stderrBuffer = '';

        // Process stdout data and send progress updates
        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdoutBuffer += chunk;
            event.sender.send('action-status', { type: 'progress', packageName: packageName, output: chunk });

            // Basic parsing for progress percentage (e.g., "[1/10] installing...")
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
                    // Send informative messages like download/install sizes
                    event.sender.send('action-status', { type: 'message', packageName: packageName, message: line });
                }
            });
            // Keep only the last partial line in buffer
            stdoutBuffer = lines[lines.length - 1];
        });

        // Process stderr data and send error progress updates
        child.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderrBuffer += chunk;
            event.sender.send('action-status', { type: 'progress', packageName: packageName, output: chunk, isError: true });
        });

        // Handle errors during command spawning
        child.on('error', (error) => {
            console.error(`Spawn error for privileged command "${terminalCommand}": ${error.message}`);
            event.sender.send('action-status', { type: 'failed', packageName: packageName, message: `Command execution failed: ${error.message}` });
            resolve({ success: false, message: `Command execution failed: ${error.message}` });
        });

        // Handle command process closure
        child.on('close', (code) => {
            if (code !== 0) {
                // Command exited with a non-zero code
                console.error(`Privileged command "${terminalCommand}" exited with code ${code}: ${stderrBuffer}`);
                event.sender.send('action-status', { type: 'failed', packageName: packageName, message: stderrBuffer || `Command exited with non-zero code ${code}` });
                resolve({ success: false, message: stderrBuffer || `Command exited with non-zero code ${code}` });
            } else {
                // Command completed successfully
                console.log(`Privileged command success for ${packageName}: ${stdoutBuffer}`);
                event.sender.send('action-status', { type: 'completed', packageName: packageName, message: 'Operation completed successfully!' });
                resolve({ success: true, message: `Operation completed successfully for ${packageName}.` });
            }
        });
    });
}

// IPC handler: Installs a package.
ipcMain.handle('install-package', (event, { packageName, packageSource, command }) => {
    let finalCommand = command; // Use command if explicitly provided
    if (!finalCommand) {
        // Construct command based on package source (AUR vs. official repos)
        if (packageSource === 'AUR') {
            finalCommand = `yay -S ${packageName}`; // Use yay for AUR packages
        } else {
            finalCommand = `pacman -S ${packageName}`; // Use pacman for Arch/Helwan packages
        }
    }
    return executePrivilegedCommand(event, finalCommand, packageName);
});

// IPC handler: Removes a package.
ipcMain.handle('remove-package', (event, { packageName, packageSource, command }) => {
    let finalCommand = command; // Use command if explicitly provided
    if (!finalCommand) {
        // Construct command based on package source (AUR vs. official repos)
        if (packageSource === 'AUR') {
            finalCommand = `yay -R ${packageName}`; // Use yay for AUR packages
        } else {
            finalCommand = `pacman -R ${packageName}`; // Use pacman for Arch/Helwan packages
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
        const result = await runShellCommand('pacman -Qu'); // Query upgradable packages

        if (result.success && result.output) {
            const updates = result.output.split('\n').filter(line => line.trim() !== '');
            if (updates.length > 0) {
                // Send a desktop notification if updates are available
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
            // Log the error message from runShellCommand for debugging
            console.error('Failed to query upgradable packages:', result.message);
            // Inform the renderer about the failure to check updates
            return { success: true, updatesAvailable: false, updateCount: 0, message: result.message || 'Failed to check for updates (might be old database or command failed).' };
        }
    } catch (error) {
        console.error('Error checking for system updates:', error);
        return { success: false, message: error.message || 'An unexpected error occurred while checking for updates.' };
    }
});

/**
 * NEW IPC Handler: Synchronizes pacman databases (`sudo pacman -Syy`).
 * This is crucial for resolving issues where pacman cannot query updates due to outdated databases.
 */
ipcMain.handle('sync-package-databases', async (event) => {
    console.log('Synchronizing package databases (sudo pacman -Syy)...');
    const command = 'pacman -Syy';
    // Use executePrivilegedCommand because -Syy requires sudo.
    // Use a generic package name 'System' for status updates.
    return executePrivilegedCommand(event, command, 'System Database Sync');
});

/**
 * NEW IPC Handler: Performs a full system update (`sudo pacman -Syu`).
 * This will synchronize package databases and then upgrade all packages.
 */
ipcMain.handle('update-system', async (event) => {
    console.log('Performing full system update (sudo pacman -Syu)...');
    const command = 'pacman -Syu';
    // Use executePrivilegedCommand as this requires sudo.
    // Use a generic package name 'System' for status updates.
    const result = await executePrivilegedCommand(event, command, 'System Update'); // تخزين النتيجة

    // *** إضافة جديدة هنا ***
    if (result.success) {
        if (Notification.isSupported()) {
            new Notification({
                title: 'Helwan Store',
                body: 'system updated successfully!',
                icon: path.join(__dirname, 'assets', 'icons', 'app_icon.png')
            }).show();
        }
    } else {
        if (Notification.isSupported()) {
            new Notification({
                title: 'Helwan Store - Error',
                body: 'system update:' + (result.message || 'Unknown Error'),
                icon: path.join(__dirname, 'assets', 'icons', 'app_icon.png')
            }).show();
        }
    }
    // *** نهاية الإضافة الجديدة ***

    return result; // أعد النتيجة الأصلية
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
