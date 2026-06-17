const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, ".env"),
});

const extraResources = [
  { from: "../api/dist-electron/node_modules", to: "./api/node_modules" },
  { from: "../api/dist-electron/api-server.mjs", to: "./api/api-server.mjs" },
  {
    from: "../api/dist-electron/node-sqlite3-wasm.wasm",
    to: "./api/node-sqlite3-wasm.wasm",
  },
  { from: "../api/dist-electron/mupdf-wasm.wasm", to: "./api/mupdf-wasm.wasm" },
  { from: "../api/dist-electron/index_bg.wasm", to: "./api/index_bg.wasm" },
  {
    from: "../../prompts",
    to: "prompts",
  },
  {
    from: "../../templates",
    to: "templates",
  },
  {
    from: "../../config.yaml",
    to: "config.yaml",
  },
  {
    from: "../../config",
    to: "config",
  },
  {
    from: "../../assets",
    to: "assets",
  },
];

const version = process.env.APP_VERSION || require("./package.json").version;

const isBeta = version.includes("-beta");
const appId = isBeta ? "com.nees.adt-studio.beta" : "com.nees.adt-studio";
const productName = isBeta ? "ADT-Studio-Beta" : "ADT-Studio";


const icons = isBeta
  ? {
      win: "build/beta-icons/icon.ico",
      mac: "build/beta-icons/icon.icns",
      linux: "build/beta-icons/icons",
    }
  : {
      win: "build/icon.ico",
      mac: "build/icon.icon",
      linux: "build/icons",
    };

const artifactName = `${productName}-\${version}.\${ext}`
  .toLowerCase()
  .replace(/ /g, "-");

const config = {
  appId,
  productName,
  electronVersion: "41.1.1",
  directories: {
    buildResources: "build",
    output: "release",
  },
  extraMetadata: {
    version,
  },
  extraResources,
  files: ["out/**/*", "!out/renderer/placeholder-*"],


  win: {
    target: ["nsis"],
    icon: icons.win,
    signtoolOptions: {
      publisherName: [
        "Núcleo de Excelência em Tecnologias Sociais - NEES",
        "UNICEF",
      ],
      sign: "./scripts/sign-windows.js",
    },
  },

  nsis: {
    artifactName,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },

  mac: {
    target: ["dmg", "zip"],
    icon: icons.mac,
    category: "public.app-category.developer-tools",
    type: "distribution",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    identity: "Developer ID Application",
    extraResources,
    extendInfo: {
      NSCameraUsageDescription:
        "Application requests access to the device's camera.",
      NSMicrophoneUsageDescription:
        "Application requests access to the device's microphone.",
      NSDocumentsFolderUsageDescription:
        "Application requests access to the user's Documents folder.",
      NSDownloadsFolderUsageDescription:
        "Application requests access to the user's Downloads folder.",
    },
  },

  dmg: {
    artifactName,
  },

  linux: {
    target: ["AppImage", "deb"],
    icon: icons.linux,
    artifactName,
    // TODO: change to "UNICEF <email@unicef.org>",
    maintainer: "electronjs.org",
  },

  publish: {
    provider: "github",
    owner: "unicef",
    repo: "adt-studio",
  },
};

module.exports = config;
