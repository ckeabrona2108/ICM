// Печатает пару ключей Ed25519 для лицензий плагинов GLAZE.
//   PLUGIN_LICENSE_PRIVATE_KEY — в .env сервера (секрет!)
//   публичный ключ — в плагины (shared/license/LicenseKey.h)
// Смена ключа = все плагины придётся пересобрать, старые версии перестанут принимать лицензии.
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);

console.log(`PLUGIN_LICENSE_PRIVATE_KEY="${seed.toString("base64")}"`);
console.log(`public key (base64): ${pub.toString("base64")}`);
console.log(`public key (C array): { ${[...pub].map((b) => `0x${b.toString(16).padStart(2, "0")}`).join(", ")} }`);
