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
  for (const key of ['r32', 'r16', 'qf', 'sf', 'final']) {
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

function renderTeamButton(match, side, slot, winner) {
  const isWinner = winner === side;
  const disabled = !slot.team;
  return `
    <button
      type="button"
      class="bracket-team${isWinner ? ' winner' : ''}${disabled ? ' is-empty' : ''}"
      data-match="${match.id}"
      data-side="${side}"
      ${disabled ? 'disabled' : ''}
    >
      ${renderFlag(slot.team)}
      <span class="bracket-team__name">${esc(slot.team || 'TBD')}</span>
      <span class="bracket-team__seed">${esc(slot.seed || '')}</span>
    </button>
  `;
}

function renderMatchCard(match, winner) {
  if (!match) return '';
  return `
    <article class="bracket-match" data-match="${match.id}">
      <div class="bracket-match__head">
        <span class="bracket-match__id">${match.id}</span>
      </div>
      ${renderTeamButton(match, 'A', match.a, winner)}
      ${renderTeamButton(match, 'B', match.b, winner)}
    </article>
  `;
}

function renderPair(m1, m2, feedsId, winners, reverse = false) {
  const matchesHtml = `
    <div class="bracket-pair-matches">
      ${renderMatchCard(m1, winners[m1?.id])}
      ${m2 ? renderMatchCard(m2, winners[m2?.id]) : ''}
    </div>
  `;
  const connectorHtml = feedsId ? `
    <div class="bracket-connector" aria-hidden="true">
      <span class="bracket-connector__label">Feeds</span>
      <span class="bracket-connector__match">${feedsId}</span>
    </div>
  ` : '';

  return `
    <div class="bracket-pair">
      ${reverse ? `${connectorHtml}${matchesHtml}` : `${matchesHtml}${connectorHtml}`}
    </div>
  `;
}

function renderRoundColumn(title, matchIds, matchById, winners, feedIds, reverse = false) {
  const pairs = [];
  for (let i = 0; i < matchIds.length; i += 2) {
    pairs.push(renderPair(
      matchById[matchIds[i]],
      matchById[matchIds[i + 1]],
      feedIds[Math.floor(i / 2)],
      winners,
      reverse,
    ));
  }

  return `
    <section class="bracket-round">
      <h2 class="bracket-round__title">${title}</h2>
      <div class="bracket-round__pairs">
        ${pairs.join('')}
      </div>
    </section>
  `;
}

function renderSingleMatchColumn(title, match, winners) {
  if (!match) return '';
  return `
    <section class="bracket-round bracket-round--solo">
      <h2 class="bracket-round__title">${title}</h2>
      <div class="bracket-round__pairs">
        ${renderMatchCard(match, winners[match.id])}
      </div>
    </section>
  `;
}

function renderHalf(side, bracket, winners) {
  const layout = BRACKET_LAYOUT[side];
  const matchById = indexMatches(bracket);
  const reverse = side === 'right';
  const rounds = [
    renderRoundColumn('Round of 32', layout.r32, matchById, winners, BRACKET_LAYOUT.feeds.r32, reverse),
    renderRoundColumn('Round of 16', layout.r16, matchById, winners, BRACKET_LAYOUT.feeds.r16, reverse),
    renderRoundColumn('Quarter-finals', layout.qf, matchById, winners, BRACKET_LAYOUT.feeds.qf, reverse),
    renderRoundColumn('Semi-finals', layout.sf, matchById, winners, BRACKET_LAYOUT.feeds.sf, reverse),
  ];
  return `
    <div class="bracket-half bracket-half--${side}">
      ${reverse ? rounds.reverse().join('') : rounds.join('')}
    </div>
  `;
}

/**
 * Athletic-inspired bracket tree: left half → final/champion ← right half,
 * with connector lines between paired matches.
 */
export function renderKnockoutTree(bracket, winners = {}) {
  const champion = bracket.championTeam || '—';
  const finalMatch = bracket.final?.[0] || null;

  return `
    <div class="knockout-scroll">
      <div class="knockout-bracket">
        ${renderHalf('left', bracket, winners)}
        <div class="bracket-center">
          ${renderSingleMatchColumn('Final', finalMatch, winners)}
          <div class="champion-display">
            <div class="champion-display__label">Champion</div>
            <div class="champion-display__value">${esc(champion)}</div>
          </div>
        </div>
        ${renderHalf('right', bracket, winners)}
      </div>
    </div>
  `;
}
