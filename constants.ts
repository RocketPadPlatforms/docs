const constants = {
  productName: 'Rocket Pad Platform',
  productNameShort: 'RPP',
  companyName: 'Rocket Pad Platforms GmbH',
  companyNameShort: 'Rocket Pad Platforms',
  companyWebsite: 'https://rocketpadplatforms.de',
  keywords: ['Kubernetes', 'K8s', 'GitOps', 'Platform', 'Developer Platform'],
  // The org page, not the repo: `platform-docs` is private, so linking
  // straight at it would 404 for every logged-out reader of the public docs
  // site. This is also what rpp.gmbh's own footer links to.
  gitBaseURL: 'https://github.com/RocketPadPlatforms',
  // Used for the "Edit this page" links. Private repo, so these only resolve
  // for org members — which is who can edit anyway.
  gitDocsRepoURL: 'https://github.com/RocketPadPlatforms/platform-docs',
  linkedinLink: 'https://www.linkedin.com/company/rocket-pad-platforms-gmbh',
  discordLink: 'https://discord.gg/WavcZPJgCH',
  hardwareRequirements: {
    minimum: {
      cluster: {
        count: 1,
        cpus: 8,
        memory: 24,
      },
      node: {
        cpus: 4,
        memory: 4,
        disk: 64,
      },
    },
    recommended: {
      cluster: {
        count: 3,
        cpus: 12,
        memory: 32,
      },
      node: {
        cpus: 6,
        memory: 16,
        disk: 512,
      },
    },
  },
};

export default constants;
