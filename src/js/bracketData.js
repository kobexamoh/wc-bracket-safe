const GROUPS = {
  A: { teams: ['Mexico', 'South Africa', 'South Korea', 'Czech Rep.'], flags: ['🇲🇽', '🇿🇦', '🇰🇷', '🇨🇿'] },
  B: { teams: ['Canada', 'Bosnia & Herz.', 'Qatar', 'Switzerland'], flags: ['🇨🇦', '🇧🇦', '🇶🇦', '🇨🇭'] },
  C: { teams: ['Brazil', 'Morocco', 'Haiti', 'Scotland'], flags: ['🇧🇷', '🇲🇦', '🇭🇹', '🏴'] },
  D: { teams: ['United States', 'Paraguay', 'Australia', 'Turkey'], flags: ['🇺🇸', '🇵🇾', '🇦🇺', '🇹🇷'] },
  E: { teams: ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'], flags: ['🇩🇪', '🇨🇼', '🇨🇮', '🇪🇨'] },
  F: { teams: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'], flags: ['🇳🇱', '🇯🇵', '🇸🇪', '🇹🇳'] },
  G: { teams: ['Belgium', 'Egypt', 'Iran', 'New Zealand'], flags: ['🇧🇪', '🇪🇬', '🇮🇷', '🇳🇿'] },
  H: { teams: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'], flags: ['🇪🇸', '🇨🇻', '🇸🇦', '🇺🇾'] },
  I: { teams: ['France', 'Senegal', 'Iraq', 'Norway'], flags: ['🇫🇷', '🇸🇳', '🇮🇶', '🇳🇴'] },
  J: { teams: ['Argentina', 'Algeria', 'Austria', 'Jordan'], flags: ['🇦🇷', '🇩🇿', '🇦🇹', '🇯🇴'] },
  K: { teams: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'], flags: ['🇵🇹', '🇨🇩', '🇺🇿', '🇨🇴'] },
  L: { teams: ['England', 'Croatia', 'Ghana', 'Panama'], flags: ['🏴', '🇭🇷', '🇬🇭', '🇵🇦'] },
};

export function getTournamentGroups() {
  return Object.entries(GROUPS).map(([code, group]) => ({
    code,
    label: `Group ${code}`,
    teams: group.teams.map((team, index) => ({
      name: team,
      flag: group.flags[index],
    })),
    flags: [...group.flags],
  }));
}

export function getGroupOrder() {
  return Object.keys(GROUPS);
}

export function getGroupTeamNames(code) {
  const group = GROUPS[code];
  return group ? [...group.teams] : [];
}

// Top 2 of each group advance automatically; rankings go up to 4 (full order).
export const ADVANCE_COUNT = 2;
export const MAX_RANK = 4;

/**
 * Render the interactive group stage.
 * `picks` is { [groupCode]: [teamName, ...] } in predicted finishing order
 * (index 0 = 1st). Each team is a button so it is clickable + keyboard friendly;
 * click handling lives in app.js via event delegation.
 */
export function renderBracket(picks = {}) {
  const groups = getTournamentGroups();

  return `
    <div class="groups-grid">
      ${groups.map((group) => renderGroupCard(group, picks[group.code] || [])).join('')}
    </div>
  `;
}

function renderGroupCard(group, ranked) {
  const chosen = Math.min(ranked.length, MAX_RANK);
  const complete = ranked.length >= ADVANCE_COUNT;

  return `
    <article class="group-card${complete ? ' is-complete' : ''}" data-group="${group.code}">
      <div class="group-card__head">
        <h3>${esc(group.label)}</h3>
        <span class="group-card__count">${chosen}/${MAX_RANK}</span>
      </div>
      <ul>
        ${group.teams.map((team, index) => renderTeamRow(group.code, team, index, ranked)).join('')}
      </ul>
    </article>
  `;
}

function renderTeamRow(code, team, index, ranked) {
  const position = ranked.indexOf(team.name) + 1; // 0 = unranked
  const advancing = position >= 1 && position <= ADVANCE_COUNT;
  const classes = ['team-row'];
  if (position > 0) classes.push('is-ranked');
  if (advancing) classes.push('is-advancing');

  return `
    <li>
      <button type="button" class="${classes.join(' ')}" data-group="${code}" data-index="${index}" aria-pressed="${position > 0}">
        <span class="rank-badge">${position > 0 ? position : ''}</span>
        <span class="team-flag">${team.flag}</span>
        <span class="team-name">${esc(team.name)}</span>
        ${advancing ? '<span class="advance-tag">Advances</span>' : ''}
      </button>
    </li>
  `;
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
