import { runSeedCli } from "@/lib/seed";

runSeedCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
