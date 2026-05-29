/**
 * Local verification harness for Generate-from-Vault.
 *
 * Runs the EXACT route code path (loadCaseDesign + generateFromVault) against
 * the live SF org via the SF CLI token (jcohen/cw) — no deployed app needed,
 * so it works even when the Vercel preview is auth-protected. Pass `reset` to
 * exercise the Reset & Regenerate path (wipe positions/edges/stamp first).
 *
 *   npx tsx --env-file=.env.local scripts/verify-generate-from-vault.ts <caseDesignId> [reset]
 */
import { loadCaseDesign } from "@/lib/case-design/sf-client";
import {
  generateFromVault,
  resetGeneratedCaseDesign,
} from "@/lib/case-design/generate-from-vault";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: verify-generate-from-vault.ts <caseDesignId> [reset]");
    process.exit(2);
  }
  if (process.argv[3] === "reset") {
    console.log("→ resetGeneratedCaseDesign…");
    await resetGeneratedCaseDesign(id);
  }
  const bundle = await loadCaseDesign(id);
  if (!bundle) {
    console.log(JSON.stringify({ error: "Case Design not found", id }));
    process.exit(1);
  }
  const result = await generateFromVault(id, bundle);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERROR:", e instanceof Error ? e.stack : e);
    process.exit(1);
  });
