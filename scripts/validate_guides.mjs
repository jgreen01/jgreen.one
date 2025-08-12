import fs from 'fs';
import path from 'path';

const guidesDir = 'guides';
const keywords = ['secret', 'password', 'apikey'];

let foundSecrets = false;

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const keyword of keywords) {
    if (content.toLowerCase().includes(keyword)) {
      console.error(`Error: Found keyword '${keyword}' in ${filePath}`);
      foundSecrets = true;
    }
  }
}

function traverseDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      traverseDir(fullPath);
    } else {
      validateFile(fullPath);
    }
  }
}

traverseDir(guidesDir);

if (foundSecrets) {
  process.exit(1);
}
