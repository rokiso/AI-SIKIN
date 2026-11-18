import "dotenv/config";
import { checkOAuthSetup } from "../lib/auth/setup-check";

// No provider requests, database writes, authorization URLs or credential output.
try {
  const result = checkOAuthSetup();
  console.log(JSON.stringify(result, null, 2));
  if (!result.environmentValid) process.exitCode = 1;
} catch {
  console.error("OAuth setup check failed. No credential values were printed.");
  process.exitCode = 1;
}
