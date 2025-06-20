// renderer.js
window.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('packages');
    const searchInput = document.getElementById('searchInput');
    const categorySelect = document.getElementById('categorySelect');
    const repoFilterSelect = document.getElementById('repoFilterSelect');
    const statusMessage = document.getElementById('statusMessage');
    const paginationControls = document.getElementById('paginationControls');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfoSpan = document.getElementById('pageInfo');
    const updateInfoSection = document.getElementById('updateInfoSection');
    const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
    const applyUpdatesBtn = document.getElementById('applyUpdatesBtn');
    const progressBarContainer = document.getElementById('progressBarContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');


    let allPackages = [];
    let filteredPackages = [];
    let currentPage = 1;
    const itemsPerPage = 100;

    const generalCategoryKeywords = {
        'all': [],
        'Multimedia': ['audio', 'video', 'player', 'media', 'codec', 'sound', 'stream', 'ffmpeg', 'gstreamer'],
        'Games': ['game', 'chess', 'emulator', 'libretro', 'arcade', 'steam'],
        'Development': ['dev', 'devel', 'code', 'ide', 'compiler', 'sdk', 'git', 'debug', 'python', 'java', 'nodejs', 'php', 'ruby', 'go', 'rust', 'editor', 'vscode', 'vim'],
        'System Tools': ['system', 'tool', 'util', 'admin', 'monitor', 'manager', 'config', 'kernel', 'boot', 'cli', 'bash', 'zsh', 'terminal'],
        'Networking': ['net', 'network', 'vpn', 'browser', 'ftp', 'ssh', 'http', 'proxy', 'dns', 'wifi', 'modem', 'router', 'web'],
        'Office': ['office', 'document', 'pdf', 'word', 'excel', 'libreoffice', 'writer', 'calc', 'impress'],
        'Graphics': ['graphic', 'image', 'photo', 'gimp', 'inkscape', 'blender', 'cad', 'draw', 'design', 'font'],
        'Education': ['edu', 'learn', 'math', 'science', 'chemistry', 'physics', 'geography'],
        'Other': []
    };

    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingDiv';
    loadingDiv.innerHTML = '<p>Loading packages...</p><div class="spinner"></div>';
    container.appendChild(loadingDiv);

    // Listener for action status updates from the main process
    window.api.onActionStatus((status) => {
        // Set initial status message and show progress bar
        if (status.type === 'started') {
            statusMessage.textContent = `Performing operation on ${status.packageName}...`;
            statusMessage.style.backgroundColor = '#f0ad4e'; // Amber for ongoing
            statusMessage.style.display = 'block';
            progressBarContainer.style.display = 'block';
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
            // Send a desktop notification for the start of the operation
            window.api.sendNotification({
                title: 'Helwan Store',
                body: `Starting ${status.command.includes('-Syu') ? 'system update' : (status.command.includes('-S ') ? 'installation' : 'removal')} of ${status.packageName}...`,
                iconPath: 'assets/icons/app_icon.png'
            });
        } else if (status.type === 'progress') {
            // Update status message with ongoing progress output
            statusMessage.style.display = 'block';
        } else if (status.type === 'percentage') {
            // Update progress bar and text for percentage updates
            progressBar.style.width = `${status.percentage}%`;
            progressText.textContent = `${status.percentage}%`;
            statusMessage.textContent = `Performing operation on ${status.packageName}... ${status.percentage}%`;
            progressBarContainer.style.display = 'block';
        } else if (status.type === 'message') {
            // Display general messages from the command output
            statusMessage.textContent = `Performing operation on ${status.packageName}: ${status.message}`;
            statusMessage.style.display = 'block';
        } else if (status.type === 'completed') {
            // Operation completed successfully
            statusMessage.textContent = `Operation on ${status.packageName} completed successfully.`;
            statusMessage.style.backgroundColor = '#5cb85c'; // Green for success
            progressBarContainer.style.display = 'none'; // Hide progress bar

            // If a system update was completed, reload all packages to get the latest installed status
            // Otherwise, just update the status of the specific package
            if (status.packageName === 'System Update' || status.command.includes('-Syu')) {
                // For system-wide updates, it's best to refetch all packages
                loadInitialPackages();
            } else {
                // For individual package install/remove, update its 'installed' status
                const pkgIndex = allPackages.findIndex(p => p.name === status.packageName);
                if (pkgIndex !== -1) {
                    allPackages[pkgIndex].installed = (status.command.includes(' -S ') || status.command.includes('-Syu'));
                }
                applyFiltersAndSearch(); // Re-render to reflect changes
            }

            // Send success desktop notification
            window.api.sendNotification({
                title: 'Helwan Store',
                body: `${status.command.includes('-Syu') ? 'System updated' : (status.command.includes('-S ') ? 'Installed' : 'Removed')} ${status.packageName} successfully!`,
                iconPath: 'assets/icons/app_icon.png'
            });

            // Hide status message after a short delay
            setTimeout(() => {
                statusMessage.style.display = 'none';
            }, 3000);
        } else if (status.type === 'failed') {
            // Operation failed
            statusMessage.textContent = `Operation on ${status.packageName} failed: ${status.message}`;
            statusMessage.style.backgroundColor = '#d9534f'; // Red for failure
            progressBarContainer.style.display = 'none'; // Hide progress bar
            // Send failure desktop notification
            window.api.sendNotification({
                title: 'Helwan Store',
                body: `${status.command.includes('-Syu') ? 'System update' : (status.command.includes('-S ') ? 'Installation' : 'Removal')} of ${status.packageName} failed: ${status.message}`,
                iconPath: 'assets/icons/app_icon.png' // Consider a separate error icon
            });
            // Hide status message after a short delay
            setTimeout(() => {
                statusMessage.style.display = 'none';
            }, 5000);
        }
    });

    /**
     * Loads all packages from the system, including Arch and AUR packages.
     * Displays a loading spinner and handles errors.
     */
    async function loadInitialPackages() {
        container.innerHTML = '';
        container.appendChild(loadingDiv);
        loadingDiv.style.display = 'flex';
        paginationControls.style.display = 'none';

        try {
            const response = await window.api.fetchAllPackages();
            loadingDiv.style.display = 'none';

            if (!response.success) {
                throw new Error(response.message || 'Failed to fetch packages from main process.');
            }
            allPackages = response.packages;
            currentPage = 1;
            applyFiltersAndSearch(); // Apply filters and display packages

            // Check for system updates after loading all packages
            checkSystemUpdates();
        } catch (err) {
            loadingDiv.style.display = 'none';
            container.innerHTML = `<p style="color: red;">Failed to load packages: ${err.message}. Please ensure 'yay' or 'paru' is installed for AUR packages.</p>`;
            console.error(err);
        }
    }

    /**
     * Checks for available system updates and updates the UI accordingly.
     * Displays a message in updateInfoSection and shows/hides the apply button.
     */
    async function checkSystemUpdates() {
        updateInfoSection.innerHTML = '<p>Checking for system updates...</p>';
        updateInfoSection.style.display = 'flex';
        updateInfoSection.style.backgroundColor = '#e0f7fa'; // Light blue for checking
        applyUpdatesBtn.style.display = 'none'; // Hide apply button initially
        checkUpdatesBtn.disabled = true; // Disable check button during check

        try {
            const response = await window.api.checkForSystemUpdates();
            if (response.success) {
                if (response.updatesAvailable) {
                    updateInfoSection.innerHTML = `<p style="color: #007bff; font-weight: bold;">${response.updateCount} system updates available!</p><button id="applyUpdatesBtn" style="margin-left: 10px;">Apply Updates</button>`;
                    updateInfoSection.style.backgroundColor = '#e0f7fa';
                    // Re-attach event listener if innerHTML was updated
                    document.getElementById('applyUpdatesBtn').addEventListener('click', applySystemUpdates);
                } else {
                    updateInfoSection.innerHTML = `<p style="color: #5cb85c; font-weight: bold;">Your system is up-to-date.</p>`;
                    updateInfoSection.style.backgroundColor = '#eafaea'; // Light green for up-to-date
                    applyUpdatesBtn.style.display = 'none'; // Ensure button is hidden if no updates
                }
            } else {
                updateInfoSection.innerHTML = `<p style="color: #d9534f; font-weight: bold;">Failed to check for updates: ${response.message}</p>`;
                updateInfoSection.style.backgroundColor = '#fcebeb'; // Light red for failure
                applyUpdatesBtn.style.display = 'none'; // Ensure button is hidden on failure
            }
        } catch (error) {
            updateInfoSection.innerHTML = `<p style="color: #d9534f; font-weight: bold;">An error occurred while checking for updates: ${error.message}</p>`;
            updateInfoSection.style.backgroundColor = '#fcebeb';
            applyUpdatesBtn.style.display = 'none';
            console.error('Error checking for system updates:', error);
        } finally {
            checkUpdatesBtn.disabled = false; // Re-enable check button
            // REMOVED: setTimeout to hide updateInfoSection if updates are available
            // updateInfoSection will now remain visible if updates are found.
            // It will only hide if no updates, or on failure.
            if (!response.updatesAvailable || !response.success) {
                setTimeout(() => {
                    updateInfoSection.style.display = 'none';
                    updateInfoSection.innerHTML = '';
                }, 5000); // Hide after 5 seconds if no updates or failed
            }
        }
    }

    /**
     * Applies all system updates by invoking the 'update-system' IPC handler.
     * Handles progress and success/failure messages.
     * This now uses the single 'update-system' IPC handler.
     */
    async function applySystemUpdates() {
        updateInfoSection.innerHTML = '<p>Applying system updates... This may take a while.</p>';
        updateInfoSection.style.backgroundColor = '#f0ad4e'; // Amber for ongoing
        updateInfoSection.style.display = 'flex';
        applyUpdatesBtn.disabled = true; // Disable apply button during update
        checkUpdatesBtn.disabled = true; // Disable check button during update

        try {
            // Call the new 'updateSystem' IPC handler from preload
            const systemUpdateResponse = await window.api.updateSystem();

            if (systemUpdateResponse.success) {
                updateInfoSection.innerHTML = '<p style="color: #5cb85c; font-weight: bold;">System updated successfully!</p>';
                updateInfoSection.style.backgroundColor = '#eafaea'; // Light green for success
                await loadInitialPackages(); // Reload packages to reflect updated statuses
            } else {
                updateInfoSection.innerHTML = `<p style="color: #d9534f; font-weight: bold;">System update failed: ${systemUpdateResponse.message}</p>`;
                updateInfoSection.style.backgroundColor = '#fcebeb'; // Light red for failure
            }
        } catch (error) {
            updateInfoSection.innerHTML = `<p style="color: #d9534f; font-weight: bold;">An error occurred during system update: ${error.message}</p>`;
            updateInfoSection.style.backgroundColor = '#fcebeb';
            console.error('Error applying system updates:', error);
        } finally {
            applyUpdatesBtn.disabled = false; // Re-enable apply button
            checkUpdatesBtn.disabled = false; // Re-enable check button
            // Hide update info section after a delay
            setTimeout(() => {
                updateInfoSection.style.display = 'none';
                updateInfoSection.innerHTML = '';
            }, 5000);
        }
    }

    /**
     * Applies filters (category, repository, search term) to the package list
     * and re-renders the displayed packages.
     */
    function applyFiltersAndSearch() {
        let packagesToProcess = allPackages;
        const searchTerm = searchInput.value.toLowerCase();
        const selectedCategory = categorySelect.value;
        const selectedRepoFilter = repoFilterSelect.value;

        // Filter by repository source (Arch, Helwan, AUR)
        if (selectedRepoFilter !== 'all') {
            packagesToProcess = packagesToProcess.filter(pkg => {
                if (selectedRepoFilter === 'Arch') {
                    const archRepos = ['core', 'extra', 'community', 'multilib', 'testing', 'kde-unstable', 'gnome-unstable'];
                    // Checks if source is 'Arch' and repo is one of the common Arch repos
                    return pkg.source === 'Arch' && archRepos.includes(pkg.repo);
                } else if (selectedRepoFilter === 'Helwan') {
                    // Specific check for 'helwan' repository
                    return pkg.repo === 'helwan';
                } else if (selectedRepoFilter === 'AUR') {
                    // Check for packages from AUR
                    return pkg.source === 'AUR';
                }
                return false; // Should not reach here if filter is valid
            });
        }

        // Filter by category using predefined keywords
        if (selectedCategory !== 'all' && generalCategoryKeywords[selectedCategory]) {
            const keywords = generalCategoryKeywords[selectedCategory].map(k => k.toLowerCase());
            packagesToProcess = packagesToProcess.filter(pkg => {
                const packageName = pkg.name.toLowerCase();
                // Check if any keyword is included in the package name
                return keywords.some(keyword => packageName.includes(keyword));
            });
        }

        // Filter by search term (name, repo, version)
        if (searchTerm) {
            packagesToProcess = packagesToProcess.filter(pkg =>
                pkg.name.toLowerCase().includes(searchTerm) ||
                pkg.repo.toLowerCase().includes(searchTerm) ||
                pkg.version.toLowerCase().includes(searchTerm)
            );
        }

        filteredPackages = packagesToProcess;
        currentPage = 1; // Reset to first page after applying filters
        displayPackages();
    }

    /**
     * Renders the packages in the UI based on the current page and filters.
     * Handles pagination controls.
     */
    function displayPackages() {
        container.innerHTML = ''; // Clear previous package list

        if (filteredPackages.length === 0) {
            container.innerHTML = '<p>No packages to display in this category/search.</p>';
            paginationControls.style.display = 'none';
            return;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredPackages.length);
        const packagesToRender = filteredPackages.slice(startIndex, endIndex);

        const totalPages = Math.ceil(filteredPackages.length / itemsPerPage);
        pageInfoSpan.textContent = `Page ${currentPage} of ${totalPages} (${filteredPackages.length} total packages)`;

        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages || filteredPackages.length === 0;

        paginationControls.style.display = 'flex'; // Show pagination controls

        // Create table structure
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Source', 'Repository', 'Name', 'Version', 'Installed', 'Action'].forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        // Populate table rows with package data
        for (const pkg of packagesToRender) {
            const row = document.createElement('tr');

            const tdSource = document.createElement('td');
            tdSource.textContent = pkg.source || 'N/A';
            row.appendChild(tdSource);

            const tdRepo = document.createElement('td');
            tdRepo.textContent = pkg.repo;
            row.appendChild(tdRepo);

            const tdName = document.createElement('td');
            tdName.textContent = pkg.name;
            row.appendChild(tdName);

            const tdVersion = document.createElement('td');
            tdVersion.textContent = pkg.version;
            row.appendChild(tdVersion);

            const tdInstalled = document.createElement('td');
            tdInstalled.textContent = pkg.installed ? 'Yes' : 'No';
            if (pkg.installed) tdInstalled.classList.add('installed');
            row.appendChild(tdInstalled);

            const tdActions = document.createElement('td');
            const installBtn = document.createElement('button');
            installBtn.textContent = 'Install';
            installBtn.classList.add('action-button');
            installBtn.disabled = pkg.installed; // Disable if already installed
            // Pass package details to handleAction
            installBtn.onclick = () => handleAction(pkg.name, pkg.source, 'install');
            tdActions.appendChild(installBtn);

            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Remove';
            removeBtn.classList.add('action-button');
            removeBtn.disabled = !pkg.installed; // Disable if not installed
            // Pass package details to handleAction
            removeBtn.onclick = () => handleAction(pkg.name, pkg.source, 'remove');
            tdActions.appendChild(removeBtn);

            row.appendChild(tdActions);
            tbody.appendChild(row);
        }

        table.appendChild(tbody);
        container.appendChild(table);
    }

    /**
     * Handles package installation or removal actions.
     * @param {string} packageName - Name of the package.
     * @param {string} packageSource - Source of the package (Arch or AUR).
     * @param {'install'|'remove'} actionType - Type of action to perform.
     */
    async function handleAction(packageName, packageSource, actionType) {
        let response;
        let command;
        if (actionType === 'install') {
            command = packageSource === 'AUR' ? `yay -S ${packageName}` : `pacman -S ${packageName}`;
            response = await window.api.installPackage({ packageName, packageSource, command });
        } else if (actionType === 'remove') {
            command = packageSource === 'AUR' ? `yay -R ${packageName}` : `pacman -R ${packageName}`;
            response = await window.api.removePackage({ packageName, packageSource, command });
        }
        if (response && !response.success) {
            console.error(`Action ${actionType} for ${packageName} failed:`, response.message);
        }
    }

    // Event listeners for pagination buttons
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            displayPackages();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredPackages.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            displayPackages();
        }
    });

    // Event listeners for search and filter inputs
    searchInput.addEventListener('input', applyFiltersAndSearch);
    categorySelect.addEventListener('change', applyFiltersAndSearch);
    repoFilterSelect.addEventListener('change', applyFiltersAndSearch);

    // Event listeners for system update buttons
    checkUpdatesBtn.addEventListener('click', checkSystemUpdates);
    // Modified to use the new `updateSystem` IPC handler
    applyUpdatesBtn.addEventListener('click', applySystemUpdates);


    // Initial package load when the DOM content is loaded
    loadInitialPackages();
});

