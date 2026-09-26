import { register } from 'node:module';

register(new URL('./ts-test-resolve.mjs', import.meta.url));
