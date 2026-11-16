import { cp, mkdir, readFile } from "node:fs/promises";
import { validateSnapshot } from "../site/src/pricing.js";

validateSnapshot(JSON.parse(await readFile(new URL("../site/data/prices.json", import.meta.url), "utf8")));
const output = new URL("../dist/", import.meta.url);
await mkdir(output, { recursive: true });
await cp(new URL("../site/", import.meta.url), output, { recursive: true });
console.log("Staatiline veebileht on valmis: dist");
