#!/usr/bin/env node
import { run } from "./run.js";

run(process.argv[2]).catch((e) => {
  console.error(e);
  process.exit(1);
});
