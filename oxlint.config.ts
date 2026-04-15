import config from '@willbooster/oxlint-config';

// @willbooster/oxlint-config currently enables a Unicorn rule that oxlint does
// not ship yet. Drop this shim after the shared config package removes it or
// oxlint adds support.
const rules = (config as { rules?: Record<string, unknown> }).rules;
delete rules?.['unicorn/consistent-template-literal-escape'];

export default config;
