const fs = require('fs');
const path = require('path');

/**
 * Recursively copies directories and files.
 */
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const srcDir = path.join(__dirname, '../src/admin/views');
const destDir = path.join(__dirname, '../dist/admin/views');

if (fs.existsSync(srcDir)) {
  copyDir(srcDir, destDir);
  console.log('Successfully copied template views to dist/admin/views');
} else {
  console.error('Source templates directory not found!');
  process.exit(1);
}
