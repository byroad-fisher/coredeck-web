#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const sourceRoot = path.resolve(
  argument('--source', process.env.MEDVENTURE_ROOT || path.resolve(projectRoot, '../MedVenture')),
);
const outputRoot = path.resolve(argument('--output', path.join(projectRoot, 'public')));

const toPosix = (value) => value.split(path.sep).join('/');
const stableCompare = (left, right) => left.localeCompare(right, 'en');

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(sourceRoot, relativePath), 'utf8'));
}

async function readYaml(relativePath) {
  return parseYaml(await readFile(path.join(sourceRoot, relativePath), 'utf8'));
}

async function jsonFiles(relativeDirectory) {
  const directory = path.join(sourceRoot, relativeDirectory);
  return (await readdir(directory))
    .filter((name) => name.endsWith('.json'))
    .sort(stableCompare)
    .map((name) => path.join(directory, name));
}

async function readJsonMap(relativeDirectory, keyName) {
  const result = new Map();
  for (const filePath of await jsonFiles(relativeDirectory)) {
    const value = JSON.parse(await readFile(filePath, 'utf8'));
    const key = keyName.split('.').reduce((current, part) => current?.[part], value);
    if (!key || result.has(key)) {
      throw new Error(`Invalid or duplicate ${keyName} in ${filePath}`);
    }
    result.set(key, value);
  }
  return result;
}

async function fingerprint(relativePaths) {
  const hash = createHash('sha256');
  for (const relativePath of [...new Set(relativePaths)].sort(stableCompare)) {
    const normalized = toPosix(relativePath);
    const content = await readFile(path.join(sourceRoot, relativePath));
    hash.update(Buffer.from(String(normalized.length).padStart(8, '0')));
    hash.update(normalized);
    hash.update(Buffer.from(String(content.length).padStart(16, '0')));
    hash.update(content);
  }
  return hash.digest('hex');
}

function gitRevision() {
  try {
    return execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function resultForInvestigation(caseData, investigationId) {
  const rule = caseData.investigation_rules?.[investigationId];
  return rule?.result_id ? caseData.investigation_results?.[rule.result_id] ?? null : null;
}

async function main() {
  const curriculum = await readYaml('curriculum/core_conditions.yaml');
  const presentationRegistry = await readYaml('curriculum/presentation_clusters.yaml');
  const encountersDocument = await readJson('game/data/encounters/encounters.json');
  const mediaDocument = await readJson('game/data/media/media_registry.json');
  const progression = await readJson('game/data/progression/progression_config.json');
  const investigationCatalogue = await readJson('game/data/catalogue/investigations.json');
  const examinationCatalogue = await readJson('game/data/catalogue/examinations.json');
  const settingsCatalogue = await readJson('game/data/catalogue/settings.json');
  const casesById = await readJsonMap('game/data/cases', 'case_metadata.case_id');
  const patientCards = await readJsonMap('game/data/patients', 'card_id');
  const conditionCards = await readJsonMap('game/data/conditions', 'card_id');
  const encounters = encountersDocument.encounters;
  const encountersByCase = new Map(encounters.map((entry) => [entry.case_id, entry]));
  const registryConditions = curriculum.conditions;
  const registryPresentations = presentationRegistry.presentations;

  expect(registryConditions.length > 0, 'No curriculum conditions found');
  expect(registryPresentations.length > 0, 'No presentation clusters found');
  expect(casesById.size > 0, 'No runtime cases found');
  expect(encountersByCase.size === casesById.size, 'Encounter and case counts differ');
  expect(patientCards.size === casesById.size, 'Patient-card and case counts differ');
  expect(conditionCards.size === casesById.size, 'Condition-card and case counts differ');

  const conditionCardsById = new Map(
    [...conditionCards.values()].map((entry) => [entry.condition_id, entry]),
  );

  const conditionList = registryConditions.map((registryEntry) => {
    const playableCaseIds = registryEntry.medventure_status?.playable_cases ?? [];
    const fallbackCardId = playableCaseIds
      .map((caseId) => encountersByCase.get(caseId)?.condition_card_id)
      .find(Boolean);
    const card =
      conditionCardsById.get(registryEntry.condition_id) ??
      (fallbackCardId ? conditionCards.get(fallbackCardId) : null) ??
      null;
    const relatedEncounters = playableCaseIds
      .map((caseId) => encountersByCase.get(caseId))
      .filter(Boolean)
      .map((encounter) => {
        const patient = patientCards.get(encounter.patient_card_id);
        return {
          caseId: encounter.case_id,
          patientCardId: encounter.patient_card_id,
          patientId: encounter.patient_id,
          patientName: patient?.display_name ?? encounter.display_name,
          ageYears: patient?.age_years ?? encounter.age_years,
          presentationId: encounter.presentation_id,
          presentation: patient?.presentation_base ?? '',
          setting: encounter.starting_setting,
        };
      });

    return {
      id: registryEntry.condition_id,
      name: registryEntry.display_name,
      aliases: registryEntry.aliases ?? [],
      specialty: registryEntry.speciality ?? null,
      system: registryEntry.system ?? null,
      ageGroups: registryEntry.age_groups ?? [],
      presentationIds: registryEntry.presentation_clusters ?? [],
      mustNotMissFor: registryEntry.must_not_miss_for ?? [],
      contrastConditionIds: registryEntry.contrast_conditions ?? [],
      priority: registryEntry.priority ?? null,
      curriculumStatus: registryEntry.curriculum_status ?? null,
      clinicalReviewStatus: registryEntry.clinical_review_status ?? null,
      relationshipsReviewStatus: registryEntry.relationships_review_status ?? null,
      sourceProvenance: registryEntry.source_provenance ?? null,
      available: Boolean(card),
      coverage: playableCaseIds.length > 1 ? 'multiple_cases' : playableCaseIds.length === 1 ? 'playable' : card ? 'card_only' : 'uncovered',
      playableCaseIds,
      card,
      encounters: relatedEncounters,
    };
  });

  const conditionNameById = new Map(conditionList.map((entry) => [entry.id, entry.name]));
  const presentationList = registryPresentations.map((entry) => ({
    id: entry.presentation_id,
    name: entry.display_name,
    aliases: entry.aliases ?? [],
    ageGroups: entry.age_groups ?? [],
    typicalSettings: entry.typical_settings ?? [],
    coreConditionIds: entry.core_conditions ?? [],
    mustNotMissIds: entry.must_not_miss ?? [],
    contrastSets: entry.contrast_sets ?? [],
    targetCaseCount: entry.target_case_count ?? null,
    existingCaseIds: entry.existing_cases ?? [],
    coverageStatus: entry.coverage_status ?? null,
    clinicalReviewStatus: entry.clinical_review_status ?? null,
    relationshipsReviewStatus: entry.relationships_review_status ?? null,
    notes: entry.notes ?? null,
    coreConditions: (entry.core_conditions ?? []).map((conditionId) => ({
      id: conditionId,
      name: conditionNameById.get(conditionId) ?? conditionId,
    })),
    mustNotMiss: (entry.must_not_miss ?? []).map((conditionId) => ({
      id: conditionId,
      name: conditionNameById.get(conditionId) ?? conditionId,
    })),
  }));

  const investigationById = new Map(
    investigationCatalogue.items.map((entry) => [entry.investigation_id, entry]),
  );
  const mediaAssetPaths = [];
  const mediaItems = [];
  for (const entry of mediaDocument.items) {
    const caseData = casesById.get(entry.case_id);
    expect(caseData, `Media ${entry.media_id} references unknown case ${entry.case_id}`);
    expect(
      Object.hasOwn(caseData.investigation_rules ?? {}, entry.investigation_id),
      `Media ${entry.media_id} references unknown investigation ${entry.investigation_id}`,
    );
    const encounter = encountersByCase.get(entry.case_id);
    const patient = encounter ? patientCards.get(encounter.patient_card_id) : null;
    const condition = encounter ? conditionCards.get(encounter.condition_card_id) : null;
    let asset = null;
    if (entry.pixel_art_variant) {
      expect(entry.pixel_art_variant.startsWith('res://'), `Invalid media path ${entry.pixel_art_variant}`);
      const relativeSource = path.join('game', entry.pixel_art_variant.slice('res://'.length));
      await readFile(path.join(sourceRoot, relativeSource));
      mediaAssetPaths.push(relativeSource);
      asset = `media/${path.basename(relativeSource)}`;
    } else {
      expect(entry.display_mode === 'text_fallback', `Missing visual asset for ${entry.media_id}`);
    }
    mediaItems.push({
      id: entry.media_id,
      type: entry.media_type,
      caseId: entry.case_id,
      investigationId: entry.investigation_id,
      investigationName:
        investigationById.get(entry.investigation_id)?.display_name ?? entry.investigation_id,
      patientName: patient?.display_name ?? encounter?.display_name ?? '',
      conditionId: condition?.condition_id ?? null,
      conditionName: condition?.display_name ?? '',
      presentationId: encounter?.presentation_id ?? null,
      altText: entry.alt_text,
      displayMode: entry.display_mode,
      clinicalReviewStatus: entry.clinical_review_status,
      asset,
      result: resultForInvestigation(caseData, entry.investigation_id),
    });
  }

  const caseFilePaths = (await jsonFiles('game/data/cases')).map((value) => path.relative(sourceRoot, value));
  const patientFilePaths = (await jsonFiles('game/data/patients')).map((value) => path.relative(sourceRoot, value));
  const conditionFilePaths = (await jsonFiles('game/data/conditions')).map((value) => path.relative(sourceRoot, value));
  const fingerprintPaths = [
    'curriculum/core_conditions.yaml',
    'curriculum/presentation_clusters.yaml',
    'game/data/encounters/encounters.json',
    'game/data/media/media_registry.json',
    'game/data/progression/progression_config.json',
    'game/data/catalogue/investigations.json',
    'game/data/catalogue/examinations.json',
    'game/data/catalogue/settings.json',
    ...caseFilePaths,
    ...patientFilePaths,
    ...conditionFilePaths,
    ...mediaAssetPaths,
  ];

  const payload = {
    schemaVersion: 1,
    product: 'coreDECK Web',
    source: {
      repository: 'https://github.com/byroad-fisher/medventure',
      revision: gitRevision(),
      fingerprintSha256: await fingerprint(fingerprintPaths),
      curriculumSource: curriculum.import_metadata ?? null,
      reviewNotice:
        'Clinical content, curriculum relationships and generated media retain their MedVenture review status. No missing clinical content has been inferred.',
    },
    stats: {
      curriculumConditions: registryConditions.length,
      playableConditions: conditionList.filter((entry) => entry.coverage === 'playable').length,
      uncoveredConditions: conditionList.filter((entry) => entry.coverage === 'uncovered').length,
      presentations: presentationList.length,
      cases: casesById.size,
      patientCards: patientCards.size,
      conditionCards: conditionCards.size,
      mediaRequirements: mediaItems.length,
      visualMedia: mediaItems.filter((entry) => entry.asset).length,
      textOnlyMedia: mediaItems.filter((entry) => !entry.asset).length,
    },
    conditions: conditionList,
    presentations: presentationList,
    media: mediaItems,
    catalogues: {
      investigations: investigationCatalogue,
      examinations: examinationCatalogue,
      settings: settingsCatalogue,
    },
    progression: {
      ranks: progression.ranks,
      rewards: progression.rewards,
      quests: progression.quests,
    },
  };

  const dataDirectory = path.join(outputRoot, 'data');
  const mediaDirectory = path.join(outputRoot, 'media');
  await mkdir(dataDirectory, { recursive: true });
  await rm(mediaDirectory, { recursive: true, force: true });
  await mkdir(mediaDirectory, { recursive: true });
  await writeFile(
    path.join(dataDirectory, 'coredeck.json'),
    `${JSON.stringify(payload)}\n`,
    'utf8',
  );

  for (const relativeSource of [...new Set(mediaAssetPaths)].sort(stableCompare)) {
    await copyFile(
      path.join(sourceRoot, relativeSource),
      path.join(mediaDirectory, path.basename(relativeSource)),
    );
  }
  await copyFile(
    path.join(sourceRoot, 'game/assets/app_icon.svg'),
    path.join(outputRoot, 'coredeck-icon.svg'),
  );

  console.log(
    JSON.stringify(
      {
        sourceRoot,
        output: path.relative(projectRoot, path.join(dataDirectory, 'coredeck.json')),
        fingerprint: payload.source.fingerprintSha256,
        stats: payload.stats,
        copiedMedia: new Set(mediaAssetPaths).size,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
