const { spawnSync } = require("node:child_process");
const path = require("node:path");

const TRUSTED_SIGNING_KEYSTORE = "eus.codesigning.azure.net";
// <TrustedSigningAccount>/<CertificateProfile> — see Azure Portal.
const TRUSTED_SIGNING_ALIAS = "NEES/neespnld";
const TIMESTAMP_URL = "http://timestamp.digicert.com";

function runJsign(args, target) {
  const jsignJar = path.resolve(__dirname, "..", "jsign.jar");
  const result = spawnSync(
    "java",
    ["-jar", jsignJar, ...args, target],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`Windows signing failed for ${target}`);
  }
}

module.exports = async function (configuration) {
  const target = configuration.path;

  const skipTargets = new Set(
    (process.env.SKIP_NOTARIZE || "")
      .toUpperCase()
      .split(/[\s,]+/)
      .filter(Boolean),
  );
  if (
    skipTargets.has("ALL") ||
    skipTargets.has("TRUE") ||
    skipTargets.has("WIN")
  ) {
    console.warn(`Windows signing skipped for ${target}`);
    return;
  }

  const selfSignedPfx = process.env.WIN_SELFSIGN_PFX;
  if (selfSignedPfx) {
    const selfSignedPassword = process.env.WIN_SELFSIGN_PASSWORD;
    if (!selfSignedPassword) {
      throw new Error(
        "Missing WIN_SELFSIGN_PASSWORD env var for self-signed Windows signing",
      );
    }
    console.log(`Signing Windows file with self-signed certificate: ${target}`);
    runJsign(
      [
        "--storetype", "PKCS12",
        "--keystore", selfSignedPfx,
        "--storepass", selfSignedPassword,
        "--tsaurl", TIMESTAMP_URL,
      ],
      target,
    );
    return;
  }

  const AZ_TOKEN = process.env.AZ_TOKEN;
  if (!AZ_TOKEN) {
    throw new Error("Missing AZ_TOKEN env var for Windows signing");
  }

  console.log(`Signing Windows file: ${target}`);
  runJsign(
    [
      "--storetype", "TRUSTEDSIGNING",
      "--keystore", TRUSTED_SIGNING_KEYSTORE,
      "--storepass", AZ_TOKEN,
      "--alias", TRUSTED_SIGNING_ALIAS,
    ],
    target,
  );
};
