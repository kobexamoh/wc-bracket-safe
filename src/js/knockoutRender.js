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

function renderFlag(teamName, flagExt = 'svg') {
  const code = teamName ? getFlagCode(teamName) : null;
  if (!code) {
    return '<span class="bracket-team__flag bracket-team__flag--empty" aria-hidden="true"></span>';
  }
  return `<img class="bracket-team__flag" src="${FLAG_BASE}${code}.${flagExt}" alt="" width="20" height="15">`;
}

function renderTeamButton(match, side, slot, winner, { locked = false, flagExt = 'svg' } = {}) {
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
      ${renderFlag(slot.team, flagExt)}
      <span class="bracket-team__name">${esc(slot.team || 'TBD')}</span>
    </button>
  `;
}

function renderMatchCard(match, winner, { locked = false, flagExt = 'svg' } = {}) {
  if (!match) return '';
  return `
    <article class="bracket-match${locked ? ' is-locked' : ''}" data-match="${match.id}">
      ${renderTeamButton(match, 'A', match.a, winner, { locked, flagExt })}
      ${renderTeamButton(match, 'B', match.b, winner, { locked, flagExt })}
    </article>
  `;
}

function renderPair(m1, m2, winners, lockedSet, flagExt = 'svg') {
  const solo = !m2;
  return `
    <div class="bracket-pair${solo ? ' bracket-pair--solo' : ''}">
      <div class="bracket-pair-matches">
        ${renderMatchCard(m1, winners[m1?.id], { locked: lockedSet.has(m1?.id), flagExt })}
        ${m2 ? renderMatchCard(m2, winners[m2?.id], { locked: lockedSet.has(m2?.id), flagExt }) : ''}
      </div>
    </div>
  `;
}

function renderRoundColumn(title, matchIds, matchById, winners, lockedSet, flagExt = 'svg') {
  const pairs = [];
  for (let i = 0; i < matchIds.length; i += 2) {
    pairs.push(renderPair(
      matchById[matchIds[i]],
      matchById[matchIds[i + 1]],
      winners,
      lockedSet,
      flagExt,
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

function renderSoloFeedRound(title, entries, matchById, winners, lockedSet, flagExt = 'svg') {
  const items = entries.map(({ match }) => renderPair(
    matchById[match],
    null,
    winners,
    lockedSet,
    flagExt,
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

function renderSingleMatchColumn(title, match, winners, { emphasis = false, lockedSet = new Set(), flagExt = 'svg' } = {}) {
  if (!match) return '';
  const mod = emphasis ? ' bracket-round--final' : '';
  return `
    <section class="bracket-round bracket-round--solo${mod}">
      ${renderRoundTitle(title)}
      <div class="bracket-round__pairs">
        ${renderMatchCard(match, winners[match.id], { locked: lockedSet.has(match.id), flagExt })}
      </div>
    </section>
  `;
}

function renderHalf(side, bracket, winners, lockedSet, flagExt = 'svg') {
  const layout = BRACKET_LAYOUT[side];
  const matchById = indexMatches(bracket);
  const reverse = side === 'right';
  const rounds = [
    renderRoundColumn('Round of 32', layout.r32, matchById, winners, lockedSet, flagExt),
    renderRoundColumn('Round of 16', layout.r16, matchById, winners, lockedSet, flagExt),
    renderSoloFeedRound('Quarter-finals', layout.qf, matchById, winners, lockedSet, flagExt),
  ];
  return `
    <div class="bracket-half bracket-half--${side}">
      ${reverse ? rounds.reverse().join('') : rounds.join('')}
    </div>
  `;
}

function renderCenterColumn(bracket, winners, lockedSet, flagExt = 'svg') {
  const matchById = indexMatches(bracket);
  const [m101, m102] = BRACKET_LAYOUT.center.sf.map((id) => matchById[id]);
  const finalMatch = bracket.final?.[0] || null;
  const thirdMatch = bracket.thirdPlace?.[0] || null;
  const bothSfPicked = winners.M101 && winners.M102;

  return `
    <div class="bracket-center">
      <div class="bracket-center__final-row">
        ${renderSingleMatchColumn('Semi-final', m101, winners, { lockedSet, flagExt })}
        ${renderSingleMatchColumn('Final', finalMatch, winners, { emphasis: true, lockedSet, flagExt })}
        ${renderSingleMatchColumn('Semi-final', m102, winners, { lockedSet, flagExt })}
      </div>
      <div class="bracket-center__third${bothSfPicked ? '' : ' bracket-center__third--locked'}">
        ${renderSingleMatchColumn('Third-place match', thirdMatch, winners, { lockedSet, flagExt })}
        ${bothSfPicked ? '' : '<p class="bracket-center__hint">Pick both semi-finals to unlock the third-place match.</p>'}
      </div>
    </div>
  `;
}

/**
 * Athletic-inspired bracket tree: left half → final/champion ← right half.
 * Connector arms are an SVG overlay painted after layout (see bracketConnectors.js).
 */
export function renderKnockoutTree(bracket, winners = {}, options = {}) {
  const lockedMatches = options.lockedMatches ?? new Set();
  const flagExt = options.flagExt ?? 'svg';
  const hidePodiumCta = options.hidePodiumCta ?? false;
  const hideScrollHint = options.hideScrollHint ?? false;
  const podiumBtn = !hidePodiumCta && bracket.championTeam
    ? `<div class="knockout-podium-cta"><button type="button" class="btn btn-primary btn-sm" id="viewPodiumBtn">View your podium picks</button></div>`
    : '';
  const scrollHint = hideScrollHint
    ? ''
    : `<p class="knockout-scroll-hint" hidden>Swipe or scroll sideways to see the full bracket</p>`;

  return `
    <div class="knockout-canvas">
      ${scrollHint}
      <div class="knockout-scroll">
        <div class="knockout-bracket">
          <svg class="bracket-lines" aria-hidden="true" focusable="false"></svg>
          ${renderHalf('left', bracket, winners, lockedMatches, flagExt)}
          ${renderCenterColumn(bracket, winners, lockedMatches, flagExt)}
          ${renderHalf('right', bracket, winners, lockedMatches, flagExt)}
        </div>
      </div>
      ${podiumBtn}
    </div>
  `;
}
