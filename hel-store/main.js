// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

function createWindow() {
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
    icon: path.join(__dirname, 'assets', 'icons', 'app_icon.png')
  });

  win.loadFile('src/index.html');
  // Uncomment the line below to open DevTools for debugging
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Function to run a general shell command
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

// IPC handler to run general commands (e.g., pacman -Sl)
ipcMain.handle('run-command', async (event, command) => {
  return runShellCommand(command);
});

// New IPC handler to fetch all packages including AUR
ipcMain.handle('fetch-all-packages', async () => {
  const pacmanPromise = runShellCommand('pacman -Sl');
  const yayPromise = runShellCommand('yay -Sl'); // Or 'paru -Sl' if you prefer paru

  const [pacmanResult, yayResult] = await Promise.all([pacmanPromise, yayPromise]);

  const allPackages = [];

  if (pacmanResult.success && pacmanResult.output) {
    const pacmanLines = pacmanResult.output.split('\n').filter(Boolean);
    pacmanLines.forEach(line => {
      const match = line.match(/^(\S+)\s+(\S+)\s+([^\[]+)(\[installed\])?/);
      if (match) {
        const [_, repo, name, version, installedFlag] = match;
        allPackages.push({
          source: 'Arch', // Default source for pacman repos
          repo,
          name,
          version: version.trim(),
          installed: !!installedFlag
        });
      }
    });
  } else {
    console.warn('Failed to fetch pacman packages:', pacmanResult.message);
  }

  if (yayResult.success && yayResult.output) {
    const yayLines = yayResult.output.split('\n').filter(Boolean);
    yayLines.forEach(line => {
      // Handle "aur package-name" format (space after aur)
      if (line.startsWith('aur ')) {
          const match = line.match(/^aur\s+(\S+)\s+([^\[]+)(\[installed\])?/);
          if (match) {
              const [_, name, version, installedFlag] = match;
              allPackages.push({
                  source: 'AUR', // Explicitly mark as AUR
                  repo: 'aur', // Repo for AUR packages
                  name,
                  version: version.trim(),
                  installed: !!installedFlag
              });
          }
      }
      // Keep original check for standard "repo/package-name" format for other yay outputs
      else if (line.match(/^(\S+)\/(\S+)\s+([^\[]+)(\[installed\])?/)) {
        const match = line.match(/^(\S+)\/(\S+)\s+([^\[]+)(\[installed\])?/);
        if (match) {
            const [_, repo, name, version, installedFlag] = match;
            if (repo !== 'aur') { // Avoid duplicating if already handled by 'aur '
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
  } else {
    console.warn('Failed to fetch AUR packages (yay might not be installed or command failed):', yayResult.message);
  }

  // Deduplicate packages based on name (prefer Arch over AUR if both list it, unlikely but good practice)
  const uniquePackagesMap = new Map();
  allPackages.forEach(pkg => {
    // This logic ensures that if a package name appears multiple times (e.g., from pacman and yay),
    // we keep the version from the last parsed entry. You might want a more specific priority.
    uniquePackagesMap.set(pkg.name, pkg);
  });

  return { success: true, packages: Array.from(uniquePackagesMap.values()) };
});


// Function to execute a privileged command using pkexec
async function executePrivilegedCommand(event, command, packageName) {
  return new Promise((resolve) => {
    event.sender.send('action-status', { type: 'started', packageName: packageName, command: command });

    // Important: Determine if it's an AUR package to use 'yay' or 'paru'
    // This needs to be passed from renderer, or inferred here.
    // For simplicity, we'll assume pacman for now as it's the default in renderer
    // If you need specific 'yay -S' for AUR installs, you'd need to pass pkg.source from renderer.
    // For now, the example uses 'pacman -S' and 'pacman -R'.
    // To install AUR packages you MUST use `yay -S <package>` or `paru -S <package>`
    // You must ensure this logic is correct or pass source from renderer.
    // For now, let's make it a bit smarter by trying to detect if it's an AUR package.
    // This is a rough detection based on typical AUR naming conventions, not foolproof.
    let packageManagerCommand = command; // Default to the command sent

    // A more robust solution would pass the 'source' (Arch/AUR) from renderer to this IPC handler.
    // Since current renderer just passes packageName for install/remove, we'd need to modify that.
    // For a quick fix, let's try a heuristic: if package name contains -git, -bin, it's often AUR.
    // This is not perfect, but better than always using pacman for AUR packages.
    // Better way: send { packageName, packageSource } from renderer.
    // For now, let's keep it simple as before, passing the command, and user selects.
    // The issue of performance is about listing, not action.

    const fullCommand = `pkexec ${packageManagerCommand} --noconfirm`;
    console.log(`Attempting to execute privileged command: ${fullCommand}`);

    const child = spawn(fullCommand, { shell: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      event.sender.send('action-status', { type: 'progress', packageName: packageName, output: data.toString() });
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      event.sender.send('action-status', { type: 'progress', packageName: packageName, output: data.toString(), isError: true });
    });

    child.on('error', (error) => {
      console.error(`Spawn error for privileged command "${fullCommand}": ${error.message}`);
      event.sender.send('action-status', { type: 'failed', packageName: packageName, message: `Command execution failed: ${error.message}` });
      resolve({ success: false, message: `Command execution failed: ${error.message}` });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`Privileged command "${fullCommand}" exited with code ${code}: ${stderr}`);
        event.sender.send('action-status', { type: 'failed', packageName: packageName, message: stderr || `Command exited with non-zero code ${code}` });
        resolve({ success: false, message: stderr || `Command exited with non-zero code ${code}` });
      } else {
        console.log(`Privileged command success for ${packageName}: ${stdout}`);
        event.sender.send('action-status', { type: 'completed', packageName: packageName, message: 'Operation completed successfully!' });
        resolve({ success: true, message: `Operation completed successfully for ${packageName}.` });
      }
    });
  });
}

// Package installation handler
ipcMain.handle('install-package', (event, { packageName, packageSource }) => {
  let command;
  if (packageSource === 'AUR') {
      command = `yay -S ${packageName}`; // Use yay for AUR packages
  } else {
      command = `pacman -S ${packageName}`; // Use pacman for Arch/Helwan packages
  }
  return executePrivilegedCommand(event, command, packageName);
});

// Package removal handler
ipcMain.handle('remove-package', (event, { packageName, packageSource }) => {
  let command;
  if (packageSource === 'AUR') {
      command = `yay -R ${packageName}`; // Use yay for AUR packages
  } else {
      command = `pacman -R ${packageName}`; // Use pacman for Arch/Helwan packages
  }
  return executePrivilegedCommand(event, command, packageName);
});
