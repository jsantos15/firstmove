const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const DATASET_PATH = path.resolve(
  __dirname,
  "../../packages/core/src/openings/data.ts"
);

function requireFromString(code, filename) {
  const mod = new Module(filename, module.parent);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(code, filename);
  return mod.exports;
}

function loadOpeningDefinitions() {
  const source = fs.readFileSync(DATASET_PATH, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: DATASET_PATH,
  });

  const mod = requireFromString(transpiled.outputText, DATASET_PATH);
  return mod.OPENING_DEFINITIONS ?? [];
}

module.exports = {
  DATASET_PATH,
  loadOpeningDefinitions,
};
