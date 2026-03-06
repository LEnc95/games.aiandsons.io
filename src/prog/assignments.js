export const ASSIGNMENT_BUNDLES = [
  {
    id: 'starter-pack',
    name: 'Starter Pack',
    desc: 'Complete 1 daily mission and 1 weekly challenge.',
    dailyRequired: 1,
    weeklyRequired: 1,
  },
  {
    id: 'focus-pack',
    name: 'Focus Pack',
    desc: 'Complete 2 daily missions and 1 weekly challenge.',
    dailyRequired: 2,
    weeklyRequired: 1,
  },
  {
    id: 'sprint-pack',
    name: 'Sprint Pack',
    desc: 'Complete 3 daily missions and 2 weekly challenges.',
    dailyRequired: 3,
    weeklyRequired: 2,
  },
];

const bundleMap = new Map(ASSIGNMENT_BUNDLES.map((bundle) => [bundle.id, bundle]));

export const getAssignmentBundleById = (bundleId) => {
  if (typeof bundleId !== 'string' || !bundleId.trim()) return null;
  return bundleMap.get(bundleId) || null;
};
