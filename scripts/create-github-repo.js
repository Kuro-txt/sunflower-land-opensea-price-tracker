/**
 * Automated GitHub Repository Creator & Uploader
 * Uses GitHub REST / Git Data API so it works even without git.exe installed locally!
 */

const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.argv[2];
if (!GITHUB_TOKEN) {
  console.error('❌ Error: GITHUB_TOKEN environment variable or command line argument is required.');
  console.error('Usage: node scripts/create-github-repo.js <YOUR_GITHUB_TOKEN>');
  process.exit(1);
}

const REPO_NAME = process.env.REPO_NAME || 'sunflower-land-opensea-price-tracker';
const REPO_DESC = 'Live web dashboard to fetch and track all items price from OpenSea for sunflower-land-collectibles';

const headers = {
  'Authorization': `token ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'SFL-OpenSea-Tracker-Publisher'
};

async function githubRequest(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok && res.status !== 404) {
    const errMsg = typeof data === 'object' ? data.message || JSON.stringify(data) : data;
    throw new Error(`GitHub API Error (${res.status}): ${errMsg}`);
  }

  return { status: res.status, data };
}

// Collect all project files to upload
function getProjectFiles(dir, baseDir = dir) {
  const filesList = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    // Ignore node_modules, .git, etc.
    if (item.name === 'node_modules' || item.name === '.git' || item.name.endsWith('.log') || item.name === '.env') {
      continue;
    }

    if (item.isDirectory()) {
      filesList.push(...getProjectFiles(fullPath, baseDir));
    } else {
      filesList.push({
        path: relPath,
        content: fs.readFileSync(fullPath)
      });
    }
  }

  return filesList;
}

async function main() {
  console.log('🔍 Checking GitHub authenticated user...');
  const userRes = await githubRequest('https://api.github.com/user');
  if (userRes.status !== 200) {
    throw new Error('Invalid GitHub token or unauthorized request.');
  }

  const username = userRes.data.login;
  console.log(`✅ Authenticated as GitHub user: @${username}`);

  // Check if repository already exists
  console.log(`🔍 Checking if repository "${REPO_NAME}" exists under @${username}...`);
  const repoCheck = await githubRequest(`https://api.github.com/repos/${username}/${REPO_NAME}`);
  
  let repo;
  if (repoCheck.status === 200) {
    console.log(`ℹ️ Repository "${username}/${REPO_NAME}" found. Synchronizing files...`);
    repo = repoCheck.data;
  } else {
    console.log(`🚀 Creating new public repository "${REPO_NAME}" on GitHub...`);
    const createRes = await githubRequest('https://api.github.com/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: REPO_NAME,
        description: REPO_DESC,
        private: false,
        auto_init: true
      })
    });

    if (createRes.status !== 201) {
      throw new Error(`Failed to create repository: ${JSON.stringify(createRes.data)}`);
    }

    repo = createRes.data;
    console.log(`✅ Repository created: ${repo.html_url}`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // Get project files
  const rootDir = path.resolve(__dirname, '..');
  const files = getProjectFiles(rootDir);
  console.log(`📦 Found ${files.length} project files to commit.`);

  // Upload each file via Contents API
  for (const file of files) {
    process.stdout.write(`  Syncing ${file.path}... `);

    // Check if file already exists in repo to get its SHA
    let existingSha;
    try {
      const getFile = await githubRequest(`https://api.github.com/repos/${username}/${REPO_NAME}/contents/${file.path}`);
      if (getFile.status === 200) {
        existingSha = getFile.data.sha;
      }
    } catch {
      // file does not exist yet
    }

    const uploadBody = {
      message: `Add/Update ${file.path}`,
      content: file.content.toString('base64'),
      branch: repo.default_branch || 'main'
    };
    if (existingSha) {
      uploadBody.sha = existingSha;
    }

    const putRes = await githubRequest(`https://api.github.com/repos/${username}/${REPO_NAME}/contents/${file.path}`, {
      method: 'PUT',
      body: JSON.stringify(uploadBody)
    });

    if (putRes.status === 200 || putRes.status === 201) {
      console.log('✅');
    } else {
      console.log(`⚠️ (Status ${putRes.status})`);
    }
  }

  console.log('\n=============================================================');
  console.log(`🎉 SUCCESS! GitHub Repository Published Successfully:`);
  console.log(`👉 ${repo.html_url}`);
  console.log('=============================================================\n');
}

main().catch(err => {
  console.error('\n❌ Error creating/updating GitHub repository:', err.message);
  process.exit(1);
});
