const path = require("path");
const fs = require("fs");
const { processNativeModules } = require("@ledgerhq/native-modules-tools");
const lldRoot = path.resolve(__dirname, "..");

function copyNativeModulesToRoot(dir) {
  for(const file of fs.readdirSync(dir, { withFileTypes: true })) {
    if(file.isDirectory()) {
      if(file.name !== "prebuilds") {
        copyNativeModulesToRoot(path.join(dir, file.name));
      }
    }
    else if(file.name.endsWith(".node")) {
      fs.copyFileSync(path.join(dir, file.name), path.join(lldRoot, "dist", "node_modules", file.name));
    }
  }
}

exports.default = async function (context) {
  // Rebuild native modules
  await context.packager.info.installAppDependencies(context.packager.platform, context.arch);
  // Remove previous node_modules
  fs.rmSync(path.join(lldRoot, "dist", "node_modules"), { recursive: true });
  // Find native modules and copy them to ./dist/node_modules with their dependencies.
  await processNativeModules({ root: lldRoot, destination: "dist", silent: true });
  // Copy native modules to root
  copyNativeModulesToRoot(path.join(lldRoot, "dist", "node_modules"));
};
