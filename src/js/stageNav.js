import { getGroupOrder, MAX_RANK } from './bracketData.js';

/**
 * Final-week mode: only the Official / Final Round stage is usable.
 * Group Stage, Third Place, and personal Knockout stay in the DOM but are
 * disabled so we don't break Official Bracket wiring or persistence.
 */
export const OFFICIAL_ONLY_MODE = true;

export const STAGE_HEADER_LABELS = {
  groups: 'Group Stage',
  third: 'Third Place',
  knockout: 'Knockout',
  officialBracket: 'The Final Round',
};

export const STAGE_HEADER_TAGLINES = {
  groups:
    'Try your hand at predicting the group stage order and eventual tournament winners, and share your picks with the rest of the Digital + Creative team.',
  third:
    'Try your hand at predicting the group stage order and eventual tournament winners, and share your picks with the rest of the Digital + Creative team.',
  knockout:
    'Try your hand at predicting the group stage order and eventual tournament winners, and share your picks with the rest of the Digital + Creative team.',
  officialBracket:
    'Spain vs Argentina in the Final. Pick the champion and the third-place match, then share your picks with the rest of the Digital + Creative team.',
};

/** OG-strict: every group must have all four ranks before Third Place unlocks. */
export function allGroupsRanked(picks = {}) {
  return getGroupOrder().every((code) => (picks[code]?.length || 0) >= MAX_RANK);
}

export function isThirdPlaceComplete(thirdGroups = []) {
  return thirdGroups.length === 8;
}

export function getStageNavState(picks, thirdGroups, activeStage) {
  if (OFFICIAL_ONLY_MODE) {
    return {
      groups: {
        active: false,
        completed: allGroupsRanked(picks),
        disabled: true,
        hidden: true,
      },
      third: {
        active: false,
        completed: isThirdPlaceComplete(thirdGroups),
        disabled: true,
        hidden: true,
      },
      knockout: {
        active: false,
        completed: false,
        disabled: true,
        hidden: true,
      },
      officialBracket: {
        active: true,
        completed: false,
        disabled: false,
        hidden: false,
      },
    };
  }

  const groupsComplete = allGroupsRanked(picks);
  const thirdComplete = isThirdPlaceComplete(thirdGroups);
  return {
    groups: { active: activeStage === 'groups', completed: groupsComplete, hidden: false },
    third: {
      active: activeStage === 'third',
      completed: thirdComplete,
      disabled: !groupsComplete,
      hidden: false,
    },
    knockout: {
      active: activeStage === 'knockout',
      completed: false,
      disabled: !thirdComplete,
      hidden: false,
    },
    officialBracket: {
      active: activeStage === 'officialBracket',
      completed: false,
      disabled: false,
      hidden: false,
    },
  };
}
