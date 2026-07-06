import { getFlagCode } from './bracketData.js';
import { BRACKET_LAYOUT } from './knockout.js';

const FLAG_BASE = '/flags/';

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function indexMatches(bracket) {
  const map = {};
  for (const key of ['r32', 'r16', 'qf', 'sf', 'final', 'thirdPlace']) {
    for (const match of bracket[key] || []) {
      map[match.id] = match;
    }
  }
  return map;
}

function renderFlag(teamName) {
  const code = teamName ? getFlagCode(teamName) : null;
  if (!code) {
    return '<span class="bracket-team__flag bracket-team__flag--empty" aria-hidden="true"></span>';
  }
  return `<img class="bracket-team__flag" src="${FLAG_BASE}${code}.svg" alt="" width="20" height="15">`;
}

function renderTeamButton(match, side, slot, winner, { locked = false } = {}) {
  const isWinner = winner === side;
  const isLoser = locked && winner && winner !== side;
  const disabled = !slot.team || locked;
  return `
    <button
      type="button"
      class="bracket-team${isWinner ? ' winner' : ''}${isLoser ? ' loser' : ''}${disabled ? ' is-empty' : ''}${locked ? ' is-locked' : ''}"
      data-match="${match.id}"
      data-side="${side}"
      aria-pressed="${isWinner ? 'true' : 'false'}"
      ${disabled ? 'disabled' : ''}
    >
      ${renderFlag(slot.team)}
      <span class="bracket-team__name">${esc(slot.team || 'TBD')}</span>
    </button>
  `;
}

function renderMatchCard(match, winner, { locked = false } = {}) {
  if (!match) return '';
  return `
    <article class="bracket-match${locked ? ' is-locked' : ''}" data-match="${match.id}">
      ${renderTeamButton(match, 'A', match.a, winner, { locked })}
      ${renderTeamButton(match, 'B', match.b, winner, { locked })}
    </article>
  `;
}

function renderPair(m1, m2, winners, lockedSet) {
  const solo = !m2;
  return `
    <div class="bracket-pair${solo ? ' bracket-pair--solo' : ''}">
      <div class="bracket-pair-matches">
        ${renderMatchCard(m1, winners[m1?.id], { locked: lockedSet.has(m1?.id) })}
        ${m2 ? renderMatchCard(m2, winners[m2?.id], { locked: lockedSet.has(m2?.id) }) : ''}
      </div>
    </div>
  `;
}

function renderRoundColumn(title, matchIds, matchById, winners, lockedSet) {
  const pairs = [];
  for (let i = 0; i < matchIds.length; i += 2) {
    pairs.push(renderPair(
      matchById[matchIds[i]],
      matchById[matchIds[i + 1]],
      winners,
      lockedSet,
    ));
  }

  return `
    <section class="bracket-round">
      ${renderRoundTitle(title)}
      <div class="bracket-round__pairs">
        ${pairs.join('')}
      </div>
    </section>
  `;
}

function renderSoloFeedRound(title, entries, matchById, winners, lockedSet) {
  const items = entries.map(({ match }) => renderPair(
    matchById[match],
    null,
    winners,
    lockedSet,
  ));

  return `
    <section class="bracket-round">
      ${renderRoundTitle(title, { qfHelp: true })}
      <div class="bracket-round__pairs">
        ${items.join('')}
      </div>
    </section>
  `;
}

function renderRoundTitle(title, { qfHelp = false } = {}) {
  const infoBtn = qfHelp
    ? '<button type="button" class="bracket-round__info" data-open-qf-help aria-label="Why semi-finals cross the bracket">?</button>'
    : '';
  return `<h2 class="bracket-round__title">${title}${infoBtn}</h2>`;
}

function renderSingleMatchColumn(title, match, winners, { emphasis = false, lockedSet = new Set() } = {}) {
  if (!match) return '';
  const mod = emphasis ? ' bracket-round--final' : '';
  return `
    <section class="bracket-round bracket-round--solo${mod}">
      ${renderRoundTitle(title)}
      <div class="bracket-round__pairs">
        ${renderMatchCard(match, winners[match.id], { locked: lockedSet.has(match.id) })}
      </div>
    </section>
  `;
}

function renderHalf(side, bracket, winners, lockedSet) {
  const layout = BRACKET_LAYOUT[side];
  const matchById = indexMatches(bracket);
  const reverse = side === 'right';
  const rounds = [
    renderRoundColumn('Round of 32', layout.r32, matchById, winners, lockedSet),
    renderRoundColumn('Round of 16', layout.r16, matchById, winners, lockedSet),
    renderSoloFeedRound('Quarter-finals', layout.qf, matchById, winners, lockedSet),
  ];
  return `
    <div class="bracket-half bracket-half--${side}">
      ${reverse ? rounds.reverse().join('') : rounds.join('')}
    </div>
  `;
}

function renderCenterColumn(bracket, winners, lockedSet) {
  const matchById = indexMatches(bracket);
  const [m101, m102] = BRACKET_LAYOUT.center.sf.map((id) => matchById[id]);
  const finalMatch = bracket.final?.[0] || null;
  const thirdMatch = bracket.thirdPlace?.[0] || null;
  const bothSfPicked = winners.M101 && winners.M102;

  return `
    <div class="bracket-center">
      <div class="bracket-center__final-row">
        ${renderSingleMatchColumn('Semi-final', m101, winners, { lockedSet })}
        ${renderSingleMatchColumn('Final', finalMatch, winners, { emphasis: true, lockedSet })}
        ${renderSingleMatchColumn('Semi-final', m102, winners, { lockedSet })}
      </div>
      <div class="bracket-center__third${bothSfPicked ? '' : ' bracket-center__third--locked'}">
        ${renderSingleMatchColumn('Third-place match', thirdMatch, winners, { lockedSet })}
        ${bothSfPicked ? '' : '<p class="bracket-center__hint">Pick both semi-finals to unlock the third-place match.</p>'}
      </div>
    </div>
  `;
}

/**
 * Athletic-inspired bracket tree: left half → final/champion ← right half,
 * with connector lines between paired matches.
 */
export function renderKnockoutTree(bracket, winners = {}, { lockedMatches = new Set() } = {}) {
  const podiumBtn = bracket.championTeam
    ? `<div class="knockout-podium-cta"><button type="button" class="btn btn-primary btn-sm" id="viewPodiumBtn">View your podium picks</button></div>`
    : '';

  return `
    <div class="knockout-canvas">
      <div class="knockout-scroll">
        <div class="knockout-bracket">
          ${renderHalf('left', bracket, winners, lockedMatches)}
          ${renderCenterColumn(bracket, winners, lockedMatches)}
          ${renderHalf('right', bracket, winners, lockedMatches)}
        </div>
      </div>
      ${podiumBtn}
    </div>
  `;
}
