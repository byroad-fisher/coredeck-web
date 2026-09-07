import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = process.cwd();
const deck = JSON.parse(await readFile(path.join(projectRoot, 'public/data/coredeck.json'), 'utf8'));

test('snapshot contains the complete accounted-for curriculum', () => {
  assert.equal(deck.schemaVersion, 1);
  assert.equal(deck.stats.curriculumConditions, 337);
  assert.equal(deck.stats.playableConditions, 240);
  assert.equal(deck.stats.uncoveredConditions, 97);
  assert.equal(deck.stats.cases, 240);
  assert.equal(deck.conditions.length, 337);
  assert.equal(new Set(deck.conditions.map((condition) => condition.id)).size, 337);
});

test('all playable conditions have authored cards and patient anchors', () => {
  const playable = deck.conditions.filter((condition) => condition.coverage === 'playable');
  assert.equal(playable.length, 240);
  for (const condition of playable) {
    assert.ok(condition.card, `${condition.id} is missing its condition card`);
    assert.ok(condition.encounters.length > 0, `${condition.id} is missing its patient anchor`);
  }
});

test('presentation clusters resolve their condition references', () => {
  const conditionIds = new Set(deck.conditions.map((condition) => condition.id));
  assert.equal(deck.presentations.length, 137);
  for (const presentation of deck.presentations) {
    assert.equal(presentation.coverageStatus, 'complete');
    for (const conditionId of presentation.coreConditionIds) assert.ok(conditionIds.has(conditionId), `${presentation.id} references ${conditionId}`);
  }
});

test('media inventory is complete and copied assets exist', async () => {
  assert.equal(deck.media.length, 74);
  assert.equal(deck.media.filter((item) => item.asset).length, 72);
  assert.equal(deck.media.filter((item) => !item.asset && item.displayMode === 'text_fallback').length, 2);
  assert.equal(new Set(deck.media.filter((item) => item.asset).map((item) => item.asset)).size, 67);
  for (const item of deck.media.filter((entry) => entry.asset)) {
    const metadata = await stat(path.join(projectRoot, 'public', item.asset));
    assert.ok(metadata.size > 0, `${item.asset} is empty`);
  }
});

test('review-required source status is preserved', () => {
  assert.ok(deck.conditions.every((condition) => condition.clinicalReviewStatus === 'review_required'));
  assert.ok(deck.presentations.every((presentation) => presentation.clinicalReviewStatus === 'review_required'));
  assert.ok(deck.media.every((item) => item.clinicalReviewStatus === 'review_required'));
});
