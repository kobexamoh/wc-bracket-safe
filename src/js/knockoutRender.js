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
  const medal = podiumMedalFor(match.id, side, winner);
  const medalHtml = medal
    ? `<span class="bracket-team__medal bracket-team__medal--${medal.place}" title="${esc(medal.label)}" aria-label="${esc(medal.label)}">${medal.glyph}</span>`
    : '';
  return `
    <button
      type="button"
      class="bracket-team${isWinner ? ' winner' : ''}${isLoser ? ' loser' : ''}${disabled ? ' is-empty' : ''}${locked ? ' is-locked' : ''}${medal ? ` has-medal has-medal--${medal.place}` : ''}"
      data-match="${match.id}"
      data-side="${side}"
      aria-pressed="${isWinner ? 'true' : 'false'}"
      ${disabled ? 'disabled' : ''}
    >
      ${renderFlag(slot.team, flagExt)}
      <span class="bracket-team__name">${esc(slot.team || 'TBD')}</span>
      ${medalHtml}
    </button>
  `;
}

/**
 * Podium medals only on Final (gold/silver) and third-place (bronze) once picked.
 * Semis stay unmarked so locked SF cards don't inherit Final medals.
 */
export function podiumMedalFor(matchId, side, winner) {
  if (!winner || (side !== 'A' && side !== 'B')) return null;
  if (matchId === 'M104') {
    return winner === side
      ? { place: 'gold', glyph: '🥇', label: 'Champion pick' }
      : { place: 'silver', glyph: '🥈', label: 'Runner-up pick' };
  }
  if (matchId === 'M103' && winner === side) {
    return { place: 'bronze', glyph: '🥉', label: 'Third-place pick' };
  }
  return null;
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

function renderSingleMatchColumn(title, match, winners, { emphasis = false, role = '', lockedSet = new Set(), flagExt = 'svg' } = {}) {
  if (!match) return '';
  const mods = [
    emphasis || role === 'final' ? ' bracket-round--final' : '',
    role === 'sf' ? ' bracket-round--sf' : '',
    role === 'third' ? ' bracket-round--third' : '',
  ].join('');
  return `
    <section class="bracket-round bracket-round--solo${mods}">
      ${renderRoundTitle(title)}
      <div class="bracket-round__pairs">
        ${renderMatchCard(match, winners[match.id], { locked: lockedSet.has(match.id), flagExt })}
      </div>
    </section>
  `;
}

function renderHalf(side, bracket, winners, lockedSet, flagExt = 'svg', startRound = 'r32') {
  const layout = BRACKET_LAYOUT[side];
  const matchById = indexMatches(bracket);
  const reverse = side === 'right';
  const rounds = [];
  if (startRound === 'r32') {
    rounds.push(renderRoundColumn('Round of 32', layout.r32, matchById, winners, lockedSet, flagExt));
  }
  if (startRound === 'r32' || startRound === 'r16') {
    rounds.push(renderRoundColumn('Round of 16', layout.r16, matchById, winners, lockedSet, flagExt));
  }
  if (startRound === 'r32' || startRound === 'r16' || startRound === 'qf') {
    rounds.push(renderSoloFeedRound('Quarter-finals', layout.qf, matchById, winners, lockedSet, flagExt));
  }
  if (rounds.length === 0) return '';
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
        ${renderSingleMatchColumn('Semi-final', m101, winners, { role: 'sf', lockedSet, flagExt })}
        ${renderSingleMatchColumn('Final', finalMatch, winners, { role: 'final', lockedSet, flagExt })}
        ${renderSingleMatchColumn('Semi-final', m102, winners, { role: 'sf', lockedSet, flagExt })}
      </div>
      <div class="bracket-center__third${bothSfPicked ? '' : ' bracket-center__third--locked'}">
        ${renderSingleMatchColumn('Third-place match', thirdMatch, winners, { role: 'third', lockedSet, flagExt })}
        ${bothSfPicked ? '' : '<p class="bracket-center__hint">Pick both semi-finals to unlock the third-place match.</p>'}
      </div>
    </div>
  `;
}

/**
 * Athletic-inspired bracket tree: left half → final/champion ← right half.
 * Connector arms are an SVG overlay painted after layout (see bracketConnectors.js).
 *
 * options.startRound: 'r32' | 'r16' | 'qf' | 'sf'
 *   Truncates early rounds (Official Bracket uses 'sf' in the endgame).
 * Endgame (sf) drops R32–QF columns, skips the swipe hint, and omits SVG arms —
 * the center strip alone should fit every viewport without horizontal scroll.
 */
export function renderKnockoutTree(bracket, winners = {}, options = {}) {
  const lockedMatches = options.lockedMatches ?? new Set();
  const flagExt = options.flagExt ?? 'svg';
  const hidePodiumCta = options.hidePodiumCta ?? false;
  const startRound = normalizeStartRound(options.startRound);
  const isEndgame = startRound === 'sf';
  const hideScrollHint = options.hideScrollHint ?? isEndgame;
  const showHalves = !isEndgame;
  const podiumBtn = !hidePodiumCta && bracket.championTeam
    ? `<div class="knockout-podium-cta"><button type="button" class="btn btn-primary btn-sm" id="viewPodiumBtn">View your podium picks</button></div>`
    : '';
  const scrollHint = hideScrollHint
    ? ''
    : `<p class="knockout-scroll-hint" hidden>Swipe or scroll sideways to see the full bracket</p>`;
  const left = showHalves ? renderHalf('left', bracket, winners, lockedMatches, flagExt, startRound) : '';
  const right = showHalves ? renderHalf('right', bracket, winners, lockedMatches, flagExt, startRound) : '';
  const roundMod = isEndgame ? ' knockout-bracket--endgame' : ` knockout-bracket--from-${startRound}`;
  const canvasMod = isEndgame ? ' knockout-canvas--endgame' : '';
  const linesSvg = isEndgame
    ? ''
    : '<svg class="bracket-lines" aria-hidden="true" focusable="false"></svg>';

  return `
    <div class="knockout-canvas${canvasMod}">
      ${scrollHint}
      <div class="knockout-scroll">
        <div class="knockout-bracket${roundMod}">
          ${linesSvg}
          ${left}
          ${renderCenterColumn(bracket, winners, lockedMatches, flagExt)}
          ${right}
        </div>
      </div>
      ${podiumBtn}
    </div>
  `;
}

function normalizeStartRound(value) {
  if (value === 'r16' || value === 'qf' || value === 'sf') return value;
  return 'r32';
}
