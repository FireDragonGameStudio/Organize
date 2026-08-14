const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectDir = path.join(__dirname, 'data', 'projects', 'test-project');
const files = ['user.json', 'system.json', 'design_input.json', 'software.json'];

const idMap = new Map(); // Map from old ID (e.g. "UR-01") to new UUID

// 1. Read all files and assign UUIDs
const allData = {};
for (const file of files) {
  const filePath = path.join(projectDir, file);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    allData[file] = data;
    for (const req of data) {
      if (!req.name && req.id) {
        // Assume it needs migration
        const newUuid = crypto.randomUUID();
        idMap.set(req.id, newUuid);
      }
    }
  }
}

// 2. Update data
for (const file of files) {
  if (allData[file]) {
    for (const req of allData[file]) {
      if (!req.name && req.id) {
        req.name = req.id;
        req.id = idMap.get(req.name);
      }
      if (req.traceLinks) {
        req.traceLinks = req.traceLinks.map(oldId => {
          return idMap.has(oldId) ? idMap.get(oldId) : oldId;
        });
      }
    }
    // 3. Save back
    fs.writeFileSync(path.join(projectDir, file), JSON.stringify(allData[file], null, 2));
    console.log(`Migrated ${file}`);
  }
}

console.log("Migration complete.");
