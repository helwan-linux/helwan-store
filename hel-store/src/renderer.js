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

  let allPackages = [];       // Stores all packages fetched from main process
  let filteredPackages = [];  // Stores packages after applying search and category filters
  let currentPage = 1;        // Current page number
  const itemsPerPage = 100;   // Number of packages to display per page

  // Define keywords for general categories (remains unchanged)
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

  // Initial loading message
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loadingDiv';
  loadingDiv.innerHTML = '<p>Loading packages...</p><div class="spinner"></div>';
  container.appendChild(loadingDiv);

  // Listen for action status updates from main process (remains unchanged)
  window.api.onActionStatus((status) => {
    if (status.type === 'started') {
      statusMessage.textContent = `Performing operation on ${status.packageName}...`;
      statusMessage.style.backgroundColor = '#f0ad4e';
      statusMessage.style.display = 'block';
    } else if (status.type === 'progress') {
      // console.log(`Progress for ${status.packageName}: ${status.output}`);
    } else if (status.type === 'completed') {
      statusMessage.textContent = `Operation on ${status.packageName} completed successfully.`;
      statusMessage.style.backgroundColor = '#5cb85c';
      
      const pkgIndex = allPackages.findIndex(p => p.name === status.packageName);
      if (pkgIndex !== -1) {
        // Update installed status based on command type (install or remove)
        allPackages[pkgIndex].installed = (status.command.includes(' -S ')); 
      }
      applyFiltersAndSearch(); // Re-apply filters to update UI immediately

      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 3000);
    } else if (status.type === 'failed') {
      statusMessage.textContent = `Operation on ${status.packageName} failed: ${status.message}`;
      statusMessage.style.backgroundColor = '#d9534f';
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 5000);
    }
  });

  // Function to fetch all packages (pacman and AUR) once on app startup
  async function loadInitialPackages() {
    container.innerHTML = '';
    container.appendChild(loadingDiv);
    loadingDiv.style.display = 'flex';
    paginationControls.style.display = 'none'; // Hide pagination during loading
    
    try {
      const response = await window.api.fetchAllPackages();
      loadingDiv.style.display = 'none';

      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch packages from main process.');
      }
      allPackages = response.packages; // Store all packages fetched
      currentPage = 1; // Reset to first page
      applyFiltersAndSearch(); // Apply filters and search after initial load
      
    } catch (err) {
      loadingDiv.style.display = 'none';
      container.innerHTML = `<p style="color: red;">Failed to load packages: ${err.message}. Please ensure 'yay' or 'paru' is installed for AUR packages.</p>`;
      console.error(err);
    }
  }

  // Function to apply category and repo filters, then search
  function applyFiltersAndSearch() {
    let packagesToProcess = allPackages;
    const searchTerm = searchInput.value.toLowerCase();
    const selectedCategory = categorySelect.value;
    const selectedRepoFilter = repoFilterSelect.value;

    // First, filter by repo source (Arch, Helwan, AUR)
    if (selectedRepoFilter !== 'all') {
      packagesToProcess = packagesToProcess.filter(pkg => {
        if (selectedRepoFilter === 'Arch') {
          const archRepos = ['core', 'extra', 'community', 'multilib', 'testing', 'kde-unstable', 'gnome-unstable'];
          return pkg.source === 'Arch' && archRepos.includes(pkg.repo);
        } else if (selectedRepoFilter === 'Helwan') {
          return pkg.repo === 'helwan';
        } else if (selectedRepoFilter === 'AUR') {
          return pkg.source === 'AUR';
        }
        return false;
      });
    }

    // Then, filter by general category keywords
    if (selectedCategory !== 'all' && generalCategoryKeywords[selectedCategory]) {
      const keywords = generalCategoryKeywords[selectedCategory].map(k => k.toLowerCase());
      packagesToProcess = packagesToProcess.filter(pkg => {
        const packageName = pkg.name.toLowerCase();
        return keywords.some(keyword => packageName.includes(keyword));
      });
    }

    // Finally, apply search filter (on top of category and repo filters)
    if (searchTerm) {
      packagesToProcess = packagesToProcess.filter(pkg =>
        pkg.name.toLowerCase().includes(searchTerm) ||
        pkg.repo.toLowerCase().includes(searchTerm) ||
        pkg.version.toLowerCase().includes(searchTerm)
      );
    }

    filteredPackages = packagesToProcess; // Update filtered packages
    currentPage = 1; // Reset to first page whenever filters or search change
    displayPackages(); // Render the first page of filtered packages
  }

  // Function to display packages for the current page
  function displayPackages() {
    container.innerHTML = ''; // Clear existing content

    if (filteredPackages.length === 0) {
      container.innerHTML = '<p>No packages to display in this category/search.</p>';
      paginationControls.style.display = 'none';
      return;
    }

    // Calculate start and end index for current page
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredPackages.length);
    const packagesToRender = filteredPackages.slice(startIndex, endIndex);

    const totalPages = Math.ceil(filteredPackages.length / itemsPerPage);
    pageInfoSpan.textContent = `Page ${currentPage} of ${totalPages} (${filteredPackages.length} total packages)`;

    // Update pagination button states
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages || filteredPackages.length === 0;
    
    paginationControls.style.display = 'flex'; // Show pagination controls

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
      installBtn.disabled = pkg.installed;
      installBtn.onclick = () => handleAction(pkg.name, pkg.source, 'install');
      tdActions.appendChild(installBtn);

      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.classList.add('action-button');
      removeBtn.disabled = !pkg.installed;
      removeBtn.onclick = () => handleAction(pkg.name, pkg.source, 'remove');
      tdActions.appendChild(removeBtn);

      row.appendChild(tdActions);
      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    container.appendChild(table);
  }

  // Pagination event handlers
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


  // Event Listeners for search and filters
  searchInput.addEventListener('input', applyFiltersAndSearch);
  categorySelect.addEventListener('change', applyFiltersAndSearch);
  repoFilterSelect.addEventListener('change', applyFiltersAndSearch);

  loadInitialPackages(); // Initial load of all packages when app starts
});
