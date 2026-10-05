#!/usr/bin/env bash
# End-to-end browser tests against a local anvil chain. Needs foundry (anvil/forge/cast) + playwright-core + sharp.
#   NODE_PATH=/path/to/node_modules ./e2e/run.sh          # full journey (plant → verify → stake → burn)
#   NODE_PATH=/path/to/node_modules ./e2e/run.sh deploy   # the in-browser /deploy page
set -euo pipefail
MODE="${1:-flow}"
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
DEPLOY_JSON=frontend/src/generated/deployment.json
cp "$DEPLOY_JSON" /tmp/treechain-deployment.backup.json
cleanup() { kill "${ANVIL_PID:-}" "${PREVIEW_PID:-}" 2>/dev/null || true; cp /tmp/treechain-deployment.backup.json "$DEPLOY_JSON"; }
trap cleanup EXIT

anvil --port 8545 --chain-id 31337 --block-time 1 >/tmp/treechain-anvil.log 2>&1 & ANVIL_PID=$!
sleep 2
# anvil has no Multicall3 predeploy; etch a minimal one at the canonical address (Monad has the real one)
forge build >/dev/null 2>&1
cast rpc anvil_setCode 0xcA11bde05977b3631167028862bE2a173976CA11 "$(forge inspect Multicall3Lite deployedBytecode)" --rpc-url http://127.0.0.1:8545 >/dev/null
if [ "$MODE" = "flow" ]; then
  # anvil dev account #0 (public test key — never use outside a local chain)
  CHECK_PERIOD_SECONDS=60 forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast >/tmp/treechain-deploy.log 2>&1
fi
(cd frontend && VITE_CHAIN=local npx vite build >/tmp/treechain-build.log 2>&1)
(cd frontend && npx vite preview --host 127.0.0.1 --port 4173 --strictPort >/tmp/treechain-preview.log 2>&1) & PREVIEW_PID=$!
sleep 3
if [ "$MODE" = "deploy" ]; then CAST="$HOME/.foundry/bin/cast" node e2e/deploy.mjs; else CAST="$HOME/.foundry/bin/cast" node e2e/flow.mjs; fi
