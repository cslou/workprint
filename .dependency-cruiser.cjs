const domains = ['artifacts', 'generation', 'exports', 'usage'];
const owners = ['db', 'storage', 'model-catalog', 'application', 'agent', ...domains];
const rules = [
  { name: 'no-cycles', from: {}, to: { circular: true } },
  { name: 'no-unresolved', from: {}, to: { couldNotResolve: true } },
  { name: 'production-no-tests', from: { path: '^(apps/[^/]+/src/|packages/)', pathNot: '\\.test\\.[jt]sx?$' }, to: { path: '(^|/)(test|tests|fixtures)/|\\.test\\.[jt]sx?$' } },
  { name: 'browser-no-server', from: { path: '^(apps/web/|packages/(contracts|api-client|player)/)' }, to: { path: '^(apps/api/|.*node_modules/(@mastra/(core|pg)|pg)/)' } },
  { name: 'browser-no-node', from: { path: '^(apps/web/|packages/(contracts|api-client|player)/)' }, to: { dependencyTypes: ['core'] } },
  { name: 'packages-no-apps', from: { path: '^packages/' }, to: { path: '^apps/' } },
  { name: 'contracts-no-transport', from: { path: '^packages/contracts/' }, to: { path: '^packages/(api-client|player)/' } },
  { name: 'player-no-app-or-transport', from: { path: '^packages/player/' }, to: { path: '^(apps/|packages/(contracts|api-client)/)' } },
  { name: 'player-no-ui-frameworks', from: { path: '^packages/player/' }, to: { path: '(^|/)node_modules/(react|react-dom|react-aria-components)/' } },
  { name: 'application-no-native', from: { path: '^apps/api/src/application/' }, to: { path: '^apps/api/src/(agent|mastra|bootstrap)/|(^|/)node_modules/@mastra/' } },
  { name: 'mechanics-no-upward', from: { path: '^apps/api/src/(db|storage|model-catalog)/' }, to: { path: '^apps/api/src/(application|agent|mastra|bootstrap|artifacts|generation|exports|usage)/' } },
  { name: 'agent-no-bootstrap', from: { path: '^apps/api/src/agent/' }, to: { path: '^apps/api/src/(mastra|bootstrap)/' } },
  { name: 'domains-no-composition', from: { path: `^apps/api/src/(${domains.join('|')})/` }, to: { path: '^apps/api/src/(application|agent|mastra|bootstrap)/|(^|/)node_modules/@mastra/' } },
  ...domains.map((owner) => ({ name: `${owner}-no-peers`, from: { path: `^apps/api/src/${owner}/` }, to: { path: `^apps/api/src/(${domains.filter((peer) => peer !== owner).join('|')})/` } })),
  ...owners.map((owner) => ({ name: `${owner}-public-interface`, from: { path: '^apps/api/src/', pathNot: `^apps/api/src/${owner}/` }, to: { path: `^apps/api/src/${owner}/`, pathNot: `^apps/api/src/${owner}/index\\.ts$` } })),
];
module.exports = {
  forbidden: rules.map((rule) => ({ severity: 'error', ...rule })),
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^apps/[^/]+/(dist|\\.mastra)/|^\\.test-build/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'], conditionNames: ['import', 'types', 'node', 'default'] },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
