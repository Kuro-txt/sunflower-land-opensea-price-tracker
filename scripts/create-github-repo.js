/**
 * Automated GitHub Repository Creator & Uploader
 * Uses GitHub REST / Git Data API so it works even without git.exe installed locally!
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

async function githubRequest(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
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
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(`\n    ⚠️ Request attempt ${attempt} failed: ${err.message}. Retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// Collect all project files to upload
function getProjectFiles(dir, baseDir = dir) {
  const filesList = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    // Ignore node_modules, .git, .github (needs workflow scope), etc.
    if (item.name === 'node_modules' || item.name === '.git' || item.name === '.github' || item.name.endsWith('.log') || item.name === '.env') {
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
    try {
      process.stdout.write(`  Syncing ${file.path}... `);

      // Compute Git SHA-1 for blob: sha1("blob " + size + "\0" + content)
      const localSha = crypto.createHash('sha1')
        .update(Buffer.concat([Buffer.from(`blob ${file.content.length}\0`), file.content]))
        .digest('hex');

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

      if (existingSha && existingSha === localSha) {
        console.log('✅ (Up to date)');
        continue;
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
        console.log('✅ Updated');
      } else {
        console.log(`⚠️ (Status ${putRes.status})`);
      }
    } catch (fileErr) {
      console.log(`❌ Error: ${fileErr.message}`);
    }
  }

  // Check and delete remote obsolete/junk files that no longer exist locally
  const localFilePaths = new Set(files.map(f => f.path));
  console.log('\n🧹 Checking for remote junk and obsolete files to remove...');
  try {
    const treeRes = await githubRequest(`https://api.github.com/repos/${username}/${REPO_NAME}/git/trees/${repo.default_branch || 'main'}?recursive=1`);
    if (treeRes.status === 200 && treeRes.data?.tree) {
      for (const item of treeRes.data.tree) {
        if (item.type !== 'blob') continue;
        if (!localFilePaths.has(item.path) && !item.path.startsWith('.github/')) {
          process.stdout.write(`  🗑️ Deleting remote junk: ${item.path}... `);
          try {
            const delRes = await githubRequest(`https://api.github.com/repos/${username}/${REPO_NAME}/contents/${item.path}`, {
              method: 'DELETE',
              body: JSON.stringify({
                message: `chore: remove obsolete file ${item.path}`,
                sha: item.sha,
                branch: repo.default_branch || 'main'
              })
            });
            if (delRes.status === 200) {
              console.log('✅ Removed');
            } else {
              console.log(`⚠️ (Status ${delRes.status})`);
            }
          } catch (delErr) {
            console.log(`❌ ${delErr.message}`);
          }
        }
      }
    }
  } catch (cleanErr) {
    console.warn('Could not clean remote files:', cleanErr.message);
  }

  // Enable / check GitHub Pages
  let pagesUrl = `https://${username}.github.io/${REPO_NAME}/`;
  try {
    console.log('\n📄 Checking GitHub Pages status...');
    const pagesCheck = await githubRequest(`https://api.github.com/repos/${username}/${REPO_NAME}/pages`);
    if (pagesCheck.status === 200 && pagesCheck.data?.html_url) {
      pagesUrl = pagesCheck.data.html_url;
      console.log(`✅ GitHub Pages active: ${pagesUrl}`);
    } else {
      console.log('Enabling GitHub Pages on main branch...');
      const enablePages = await githubRequest(`https://api.github.com/repos/${username}/${REPO_NAME}/pages`, {
        method: 'POST',
        body: JSON.stringify({
          source: { branch: repo.default_branch || 'main', path: '/' }
        })
      });
      if (enablePages.status === 201 && enablePages.data?.html_url) {
        pagesUrl = enablePages.data.html_url;
        console.log(`✅ GitHub Pages enabled: ${pagesUrl}`);
      }
    }
  } catch (err) {
    console.log(`ℹ️ GitHub Pages note: ${err.message}`);
  }

  console.log('\n=============================================================');
  console.log(`🎉 SUCCESS! GitHub Repository Published Successfully:`);
  console.log(`👉 Repo:  ${repo.html_url}`);
  console.log(`👉 Pages: ${pagesUrl}`);
  console.log('=============================================================\n');
}

main().catch(err => {
  console.error('\n❌ Error creating/updating GitHub repository:', err.message);
  process.exit(1);
});
