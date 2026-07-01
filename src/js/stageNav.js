import { getGroupOrder, MAX_RANK } from './bracketData.js';

export const STAGE_HEADER_LABELS = {
  groups: 'Group Stage',
  third: 'Third Place',
  knockout: 'Knockout',
};

/** OG-strict: every group must have all four ranks before Third Place unlocks. */
export function allGroupsRanked(picks = {}) {
  return getGroupOrder().every((code) => (picks[code]?.length || 0) >= MAX_RANK);
}

export function isThirdPlaceComplete(thirdGroups = []) {
  return thirdGroups.length === 8;
}

export function getStageNavState(picks, thirdGroups, activeStage) {
  const groupsComplete = allGroupsRanked(picks);
  const thirdComplete = isThirdPlaceComplete(thirdGroups);
  return {
    groups: { active: activeStage === 'groups', completed: groupsComplete },
    third: {
      active: activeStage === 'third',
      completed: thirdComplete,
      disabled: !groupsComplete,
    },
    knockout: {
      active: activeStage === 'knockout',
      completed: false,
      disabled: !thirdComplete,
    },
  };
}
