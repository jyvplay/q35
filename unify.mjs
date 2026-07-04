import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// --- CONFIGURATION ---
const OLD_PKG_NAME = 'veritas-universal-rigor-guard-v15';
const NEW_PKG_NAME = 'veritas-q35-unified';
const OLD_REPO_PATH = 'jyvplay/CO48think';
const NEW_REPO_PATH = 'jyvplay/q35';
const OLD_REPO_URL = `https://github.com/${OLD_REPO_PATH}`;
const NEW_REPO_URL = `https://github.com/${NEW_REPO_PATH}`;
// ---------------------

console.log("🚀 Starting Unified Q35 Migration Script...");

const npmPkgPath = path.resolve('node_modules', OLD_PKG_NAME, 'package.json');
if (!fs.existsSync(npmPkgPath)) {
    console.log("📦 Base package not found. Installing...");
    execSync(`npm install ${OLD_PKG_NAME} --no-save`, { stdio: 'inherit' });
}

console.log("2. Merging package.json dependencies...");
const localPkgPath = path.resolve('package.json');
const localPkg = JSON.parse(fs.readFileSync(localPkgPath, 'utf-8'));
const npmPkg = JSON.parse(fs.readFileSync(npmPkgPath, 'utf-8'));

localPkg.dependencies = { ...npmPkg.dependencies, ...localPkg.dependencies };
delete localPkg.dependencies[OLD_PKG_NAME];
localPkg.name = NEW_PKG_NAME;
localPkg.version = "1.0.0";

if (localPkg.repository) {
    if (typeof localPkg.repository === 'string') localPkg.repository = NEW_REPO_URL;
    else localPkg.repository.url = `git+${NEW_REPO_URL}.git`;
}
if (localPkg.bugs) localPkg.bugs.url = `${NEW_REPO_URL}/issues`;
if (localPkg.homepage) localPkg.homepage = `${NEW_REPO_URL}#readme`;

fs.writeFileSync(localPkgPath, JSON.stringify(localPkg, null, 2));

console.log("3. Fusing src directories...");
if (fs.existsSync('src_advanced')) fs.rmSync('src_advanced', { recursive: true, force: true });
fs.renameSync('src', 'src_advanced');
fs.cpSync(path.join('node_modules', OLD_PKG_NAME, 'src'), 'src', { recursive: true });

console.log("4. Resolving App.tsx collision...");
fs.renameSync(path.join('src', 'App.tsx'), path.join('src', 'BaseApp.tsx'));

console.log("5. Merging Advanced Overlay...");
const stubsToDrop = ['compute-sandbox.ts', 'constraints.ts', 'models.ts', 'rpm-governor.ts'];

function copyAdvanced(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const relPath = path.relative('src_advanced', fullPath);
        const targetPath = path.join('src', relPath);

        if (fs.statSync(fullPath).isDirectory()) {
            if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
            copyAdvanced(fullPath);
        } else {
            const normalizedRelPath = relPath.split(path.sep).join('/');
            if (normalizedRelPath.startsWith('lib/') && stubsToDrop.includes(file)) continue;
            fs.copyFileSync(fullPath, targetPath);
        }
    }
}
copyAdvanced('src_advanced');
fs.rmSync('src_advanced', { recursive: true, force: true });

console.log("6. Patching App.tsx and Tailwind CSS...");
const appTsxPath = path.join('src', 'App.tsx');
let appTsx = fs.readFileSync(appTsxPath, 'utf-8');
appTsx = appTsx.replace(`${OLD_PKG_NAME}/src/App`, './BaseApp');
fs.writeFileSync(appTsxPath, appTsx);

const cssPath = path.join('src', 'index.css');
let css = fs.readFileSync(cssPath, 'utf-8');
css = css.replace(new RegExp(`@source\\s+"\\.\\./node_modules/${OLD_PKG_NAME}/src";?\\r?\\n?`, 'g'), '');
fs.writeFileSync(cssPath, css);

console.log("7. Rewriting NPM imports...");
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.md', '.html', '.json'];

function patchFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            patchFiles(fullPath);
        } else if (EXTENSIONS.includes(path.extname(fullPath))) {
            let content = fs.readFileSync(fullPath, 'utf-8');
            let modified = false;
            const importRegex = new RegExp(`${OLD_PKG_NAME}/src/`, 'g');
            if (importRegex.test(content)) { content = content.replace(importRegex, '@/'); modified = true; }
            if (content.includes(OLD_PKG_NAME)) { content = content.replaceAll(OLD_PKG_NAME, NEW_PKG_NAME); modified = true; }
            if (content.includes(OLD_REPO_PATH) || content.includes(OLD_REPO_URL)) {
                content = content.replaceAll(OLD_REPO_URL, NEW_REPO_URL);
                content = content.replaceAll(OLD_REPO_PATH, NEW_REPO_PATH);
                modified = true;
            }
            if (modified) fs.writeFileSync(fullPath, content, 'utf-8');
        }
    }
}
patchFiles('src');
patchFiles('public');

['README.md', 'index.html', 'vite.config.ts'].forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf-8');
        let modified = false;
        if (content.includes(OLD_PKG_NAME)) { content = content.replaceAll(OLD_PKG_NAME, NEW_PKG_NAME); modified = true; }
        if (content.includes(OLD_REPO_URL)) { content = content.replaceAll(OLD_REPO_URL, NEW_REPO_URL); modified = true; }
        if (content.includes(OLD_REPO_PATH)) { content = content.replaceAll(OLD_REPO_PATH, NEW_REPO_PATH); modified = true; }
        if (modified) fs.writeFileSync(file, content, 'utf-8');
    }
});

console.log("8. Cleaning up...");
fs.rmSync(path.join('node_modules', OLD_PKG_NAME), { recursive: true, force: true });
if (fs.existsSync('package-lock.json')) fs.rmSync('package-lock.json');
execSync('npm install', { stdio: 'inherit' });

console.log(`✅ Unification complete! Push to ${NEW_REPO_PATH} and publish to NPM as ${NEW_PKG_NAME}.`);