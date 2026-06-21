const fs = require("fs");
const path = require("path");

function writeJsonObjectFileSync(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tempPath, "w");

  try {
    fs.writeSync(fd, "{\n");
    const entries = Object.entries(value ?? {});
    for (let index = 0; index < entries.length; index += 1) {
      const [key, entryValue] = entries[index];
      fs.writeSync(fd, `  ${JSON.stringify(key)}: ${JSON.stringify(entryValue)}`);
      fs.writeSync(fd, index === entries.length - 1 ? "\n" : ",\n");
    }
    fs.writeSync(fd, "}\n");
  } catch (error) {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup only.
    }
    throw error;
  }

  fs.closeSync(fd);
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup only.
    }
    throw error;
  }
}

module.exports = {
  writeJsonObjectFileSync,
};
