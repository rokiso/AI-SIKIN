import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildS3PolicyPlan } from "../lib/storage/s3-policy-plan";

async function main() {
  let bucket = "";
  let output: string | undefined;
  let allowLocalhost = false;
  const origins: string[] = [];
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--allow-localhost") {
      allowLocalhost = true;
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error("Missing argument");
    if (flag === "--bucket") bucket = value;
    else if (flag === "--origin") origins.push(value);
    else if (flag === "--out") output = value;
    else throw new Error("Unknown option");
  }
  // Validate and render before creating files. This script never loads AWS credentials
  // or contacts AWS and has no apply mode.
  const files = await buildS3PolicyPlan({ bucket, origins, allowLocalhost });
  const directory = output ?? (await mkdtemp(join(tmpdir(), "miruvia-s3-plan-")));
  if (output) await mkdir(output, { mode: 0o700 });
  for (const file of files)
    await writeFile(join(directory, file.name), `${JSON.stringify(file.contents, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  console.log(`Prepared ${files.length} local policy files: ${directory}`);
  console.log("AWS was not contacted. Review the files before any separate account changes.");
}

main().catch(() => {
  console.error("Policy generation failed. Check arguments and use a new output directory.");
  console.error(
    "Usage: npm run storage:plan -- --bucket NAME --origin https://APP [--origin ORIGIN] [--allow-localhost] [--out NEW_DIRECTORY]",
  );
  process.exitCode = 1;
});
