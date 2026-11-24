// web3.js / anchor / the ephemeral-rollups SDK touch Buffer while loading.
import { Buffer } from 'buffer';

globalThis.Buffer ??= Buffer;
globalThis.global ??= globalThis;
