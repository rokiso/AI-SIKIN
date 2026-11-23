import "dotenv/config";
import { checkAffiliateSetup } from "../lib/catalog/affiliate-setup";
const result = checkAffiliateSetup();
console.log(JSON.stringify(result, null, 2));
if (!result.configurationValid) process.exitCode = 1;
