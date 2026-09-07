'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import NextImage from 'next/image';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpenText,
  Brain,
  Check,
  CircleAlert,
  GitCompareArrows,
  Image as ImageIcon,
  Layers3,
  Menu,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import type {
  Condition,
  DeckData,
  LearnerState,
  MediaItem,
  Presentation,
  QuickView,
  RecallRating,
  StudyMode,
} from '@/lib/coredeck-types';

declare global {
  interface Document {
    modelContext?: {
      registerTool(tool: {
        name: string;
        title?: string;
        description: string;
        inputSchema: Record<string, unknown>;
        annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
        execute(input: unknown): unknown;
      }, options?: { signal?: AbortSignal }): void | Promise<void>;
    };
  }
}

const STORAGE_KEY = 'coredeck-web:learner-state:v1';
const EMPTY_LEARNER_STATE: LearnerState = { savedConditionIds: [], recallRatings: {} };

const modes: Array<{ id: StudyMode; label: string; shortLabel: string; icon: typeof BookOpenText }> = [
  { id: 'conditions', label: 'Core conditions', shortLabel: 'Conditions', icon: BookOpenText },
  { id: 'presentations', label: 'Presentations', shortLabel: 'Present', icon: Layers3 },
  { id: 'compare', label: 'Compare', shortLabel: 'Compare', icon: GitCompareArrows },
  { id: 'images', label: 'Clinical images', shortLabel: 'Images', icon: ImageIcon },
  { id: 'recall', label: 'Recall', shortLabel: 'Recall', icon: Brain },
];

const modeTitles: Record<StudyMode, { eyebrow: string; title: string }> = {
  conditions: { eyebrow: 'Condition-first revision', title: 'Core conditions' },
  presentations: { eyebrow: 'Start with the symptom', title: 'Presentations' },
  compare: { eyebrow: 'Find the discriminator', title: 'Compare conditions' },
  images: { eyebrow: 'Look, interpret, connect', title: 'Clinical images' },
  recall: { eyebrow: 'Retrieve before revealing', title: 'Recall practice' },
};

const sectionLabels: Record<string, string> = {
  what_is_it: 'What is it?',
  who_gets_it: 'Who gets it / risk factors?',
  typical_presentation: 'Typical presentation',
  examination: 'Important examination findings',
  key_differential: 'Key differentials',
  initial_investigations: 'Investigations',
  interpretation_of_results: 'Interpretation of results',
  management: 'Management',
  complications: 'Complications',
  red_flags_and_escalation: 'Red flags and escalation',
  how_to_distinguish: 'How to distinguish it',
};

function humanise(value: string | null | undefined) {
  if (!value) return 'Not specified';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderAuthoredValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(' · ');
  return value || 'Not supplied in the source card.';
}

function loadLearnerState(): LearnerState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY_LEARNER_STATE, ...JSON.parse(raw) } : EMPTY_LEARNER_STATE;
  } catch {
    return EMPTY_LEARNER_STATE;
  }
}

export default function StudyApp() {
  const [data, setData] = useState<DeckData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<StudyMode>('conditions');
  const [query, setQuery] = useState('');
  const [conditionFilter, setConditionFilter] = useState('available');
  const [selectedConditionId, setSelectedConditionId] = useState<string | null>(null);
  const [selectedPresentationId, setSelectedPresentationId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [mediaType, setMediaType] = useState('all');
  const [learner, setLearner] = useState<LearnerState>(EMPTY_LEARNER_STATE);
  const [recallConditionId, setRecallConditionId] = useState<string | null>(null);
  const [recallPromptIndex, setRecallPromptIndex] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setLearner(loadLearnerState()));
    fetch('./data/coredeck.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Data request failed (${response.status})`);
        return response.json() as Promise<DeckData>;
      })
      .then((payload: DeckData) => {
        setData(payload);
        const firstCondition = payload.conditions.find((condition) => condition.available);
        const firstPresentation = payload.presentations[0];
        const initialCompare = payload.presentations
          .find((presentation) => presentation.coreConditionIds.length >= 2)
          ?.coreConditionIds.slice(0, 2) ?? payload.conditions.filter((condition) => condition.available).slice(0, 2).map((condition) => condition.id);
        setSelectedConditionId(firstCondition?.id ?? null);
        setSelectedPresentationId(firstPresentation?.id ?? null);
        setCompareIds(initialCompare);
        setRecallConditionId(firstCondition?.id ?? null);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'The deck could not be loaded.'));
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    }
  }, []);

  const persistLearner = useCallback((update: (current: LearnerState) => LearnerState) => {
    setLearner((current) => {
      const next = update(current);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const openCondition = useCallback((conditionId: string) => {
    setSelectedConditionId(conditionId);
    setMode('conditions');
    setQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const recordRecall = useCallback((conditionId: string, rating: RecallRating) => {
    persistLearner((current) => ({
      ...current,
      recallRatings: {
        ...current.recallRatings,
        [conditionId]: { rating, reviewedAt: new Date().toISOString() },
      },
    }));
  }, [persistLearner]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool || !data) return;
    const lifecycle = new AbortController();
    const report = () => undefined;
    const register = (tool: Parameters<typeof context.registerTool>[0]) => {
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(report); } catch { report(); }
    };
    register({
      name: 'navigate_study_mode',
      title: 'Open study mode',
      description: 'Open one of the visible coreDECK study modes.',
      inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: modes.map((item) => item.id) } }, required: ['mode'], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        const nextMode = (input as { mode?: StudyMode })?.mode;
        if (!modes.some((item) => item.id === nextMode)) throw new Error('Unknown study mode');
        setMode(nextMode as StudyMode);
        return { mode: nextMode };
      },
    });
    register({
      name: 'open_condition',
      title: 'Open condition',
      description: 'Open an existing condition in the visible condition study view.',
      inputSchema: { type: 'object', properties: { conditionId: { type: 'string' } }, required: ['conditionId'], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        const conditionId = (input as { conditionId?: string })?.conditionId;
        if (!data.conditions.some((condition) => condition.id === conditionId)) throw new Error('Unknown condition');
        openCondition(conditionId as string);
        return { mode: 'conditions', conditionId };
      },
    });
    register({
      name: 'record_recall_confidence',
      title: 'Record recall confidence',
      description: 'Record a visible recall rating for a condition on this device.',
      inputSchema: { type: 'object', properties: { conditionId: { type: 'string' }, rating: { type: 'string', enum: ['again', 'hard', 'good'] } }, required: ['conditionId', 'rating'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const { conditionId, rating } = input as { conditionId?: string; rating?: RecallRating };
        if (!data.conditions.some((condition) => condition.id === conditionId && condition.available)) throw new Error('Condition has no recall card');
        if (!['again', 'hard', 'good'].includes(rating ?? '')) throw new Error('Invalid recall rating');
        recordRecall(conditionId as string, rating as RecallRating);
        setRecallConditionId(conditionId as string);
        setMode('recall');
        return { conditionId, rating, saved: true };
      },
    });
    return () => lifecycle.abort();
  }, [data, openCondition, recordRecall]);

  const playableConditions = useMemo(() => data?.conditions.filter((condition) => condition.available) ?? [], [data]);
  const conditionById = useMemo(() => new Map(data?.conditions.map((condition) => [condition.id, condition]) ?? []), [data]);
  const selectedCondition = conditionById.get(selectedConditionId ?? '') ?? playableConditions[0];
  const selectedPresentation = data?.presentations.find((presentation) => presentation.id === selectedPresentationId) ?? data?.presentations[0];
  const recallCondition = conditionById.get(recallConditionId ?? '') ?? playableConditions[0];

  const switchMode = (nextMode: StudyMode) => {
    setMode(nextMode);
    setQuery('');
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nav = (
    <nav aria-label="Study modes" className="side-nav">
      {modes.map(({ id, label, icon: Icon }) => (
        <button key={id} className={mode === id ? 'nav-item active' : 'nav-item'} type="button" onClick={() => switchMode(id)}>
          <Icon aria-hidden="true" size={19} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );

  if (loadError) {
    return <main className="load-state"><CircleAlert size={34} /><h1>coreDECK could not open</h1><p>{loadError}</p><Button onClick={() => window.location.reload()}>Try again</Button></main>;
  }

  return (
    <main className="app-shell">
      <aside className="desktop-rail">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <Brand />
        {nav}
        <button type="button" className="source-note" onClick={() => setSourceOpen(true)}><ShieldAlert aria-hidden="true" size={17} /><p>MedVenture source</p><span>Clinical review required</span></button>
      </aside>

      {menuOpen && <div className="mobile-drawer"><div className="drawer-head"><Brand /><Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X /></Button></div>{nav}<button type="button" className="source-note" onClick={() => setSourceOpen(true)}><ShieldAlert size={17} /><p>Source status</p><span>Clinical review required</span></button></div>}

      <section className="workspace" id="main-content">
        <header className="topbar">
          <Button variant="ghost" size="icon" className="menu-button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu /></Button>
          <div><p className="eyebrow">{modeTitles[mode].eyebrow}</p><h1>{modeTitles[mode].title}</h1></div>
          {data && <button className="coverage-chip" type="button" onClick={() => setSourceOpen(true)} aria-label={`${data.stats.playableConditions} of ${data.stats.curriculumConditions} conditions playable`}><span>{data.stats.playableConditions}</span> / {data.stats.curriculumConditions}</button>}
        </header>

        {!data ? <LoadingDeck /> : <>
          {mode === 'conditions' && <ConditionsView data={data} query={query} setQuery={setQuery} filter={conditionFilter} setFilter={setConditionFilter} selected={selectedCondition} openCondition={openCondition} learner={learner} persistLearner={persistLearner} />}
          {mode === 'presentations' && <PresentationsView presentations={data.presentations} query={query} setQuery={setQuery} selected={selectedPresentation} setSelected={setSelectedPresentationId} openCondition={openCondition} />}
          {mode === 'compare' && <CompareView conditions={playableConditions} selectedIds={compareIds} setSelectedIds={setCompareIds} openCondition={openCondition} />}
          {mode === 'images' && <ImagesView media={data.media} query={query} setQuery={setQuery} mediaType={mediaType} setMediaType={setMediaType} openMedia={setSelectedMedia} />}
          {mode === 'recall' && <RecallView conditions={playableConditions} condition={recallCondition} setConditionId={(id) => { setRecallConditionId(id); setRecallPromptIndex(0); setAnswerVisible(false); }} promptIndex={recallPromptIndex} setPromptIndex={setRecallPromptIndex} answerVisible={answerVisible} setAnswerVisible={setAnswerVisible} learner={learner} recordRecall={recordRecall} />}
        </>}
      </section>

      <nav className="mobile-nav" aria-label="Study modes">
        {modes.map(({ id, shortLabel, icon: Icon }) => <button key={id} type="button" onClick={() => switchMode(id)} className={mode === id ? 'active' : ''}><Icon aria-hidden="true" size={18} /><span>{shortLabel}</span></button>)}
      </nav>

      <SourceDialog open={sourceOpen} setOpen={setSourceOpen} data={data} />
      <MediaDialog media={selectedMedia} close={() => setSelectedMedia(null)} openCondition={openCondition} />
    </main>
  );
}

function Brand() {
  return <div className="brand-mark" aria-label="coreDECK Web"><span className="brand-core">core</span><span className="brand-deck">DECK</span><span className="brand-web">WEB</span></div>;
}

function LoadingDeck() {
  return <div className="loading-deck"><div className="pulse-line" /><div className="pulse-card" /><p>Reading the MedVenture deck…</p></div>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="search-box"><Search aria-hidden="true" size={19} /><Input aria-label={placeholder} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function ConditionsView({ data, query, setQuery, filter, setFilter, selected, openCondition, learner, persistLearner }: {
  data: DeckData; query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void; selected: Condition | undefined; openCondition: (id: string) => void; learner: LearnerState; persistLearner: (update: (current: LearnerState) => LearnerState) => void;
}) {
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.conditions.filter((condition) => {
      if (filter === 'available' && !condition.available) return false;
      if (filter === 'saved' && !learner.savedConditionIds.includes(condition.id)) return false;
      if (filter === 'gaps' && condition.available) return false;
      return !needle || condition.name.toLowerCase().includes(needle) || condition.aliases.some((alias) => alias.toLowerCase().includes(needle)) || condition.presentationIds.some((id) => id.includes(needle.replaceAll(' ', '_')));
    });
  }, [data.conditions, filter, learner.savedConditionIds, query]);
  const saved = selected ? learner.savedConditionIds.includes(selected.id) : false;
  const toggleSaved = () => selected && persistLearner((current) => ({ ...current, savedConditionIds: saved ? current.savedConditionIds.filter((id) => id !== selected.id) : [...current.savedConditionIds, selected.id] }));

  return <>
    <div className="control-row">
      <SearchBox value={query} onChange={setQuery} placeholder="Search conditions or presentations" />
      <div className="filter-pills" aria-label="Condition filters">
        {[['available', 'Playable'], ['all', 'All 337'], ['saved', 'Saved'], ['gaps', 'Source gaps']].map(([id, label]) => <button key={id} type="button" className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
    </div>
    <div className="study-grid">
      <section className="condition-list" aria-label="Condition results">
        <div className="section-label"><span>Browse the deck</span><span>{filtered.length} shown</span></div>
        {filtered.length === 0 ? <div className="empty-list"><Search /><p>No condition matches this view.</p></div> : filtered.map((condition) => <button type="button" key={condition.id} className={condition.id === selected?.id ? 'condition-row selected' : 'condition-row'} onClick={() => openCondition(condition.id)}>
          <div className="condition-monogram">{condition.name.slice(0, 2).toUpperCase()}</div>
          <div><strong>{condition.name}</strong><span>{condition.available ? condition.presentationIds.slice(0, 2).map(humanise).join(' · ') : 'No authored card or case'}</span></div>
          <Badge variant="outline" className={condition.available ? '' : 'gap-badge'}>{condition.available ? 'Playable' : 'Gap'}</Badge><ArrowRight aria-hidden="true" size={18} />
        </button>)}
      </section>
      <ConditionDetail condition={selected} saved={saved} toggleSaved={toggleSaved} openPresentation={(presentationId) => { const element = document.querySelector(`[data-presentation-id="${presentationId}"]`); element?.scrollIntoView(); }} />
    </div>
  </>;
}

function ConditionDetail({ condition, saved, toggleSaved }: { condition: Condition | undefined; saved: boolean; toggleSaved: () => void; openPresentation: (id: string) => void }) {
  if (!condition) return <aside className="condition-preview empty-preview">Choose a condition to inspect its authored card.</aside>;
  if (!condition.card) return <aside className="condition-preview"><div className="preview-heading"><div><p>Curriculum entry</p><h2>{condition.name}</h2></div><Badge variant="outline">Uncovered</Badge></div><div className="gap-panel"><CircleAlert /><h3>No authored condition card</h3><p>This entry is in the MedVenture curriculum registry, but it has no mapped presentation, playable case or condition card. coreDECK Web does not fill this gap with outside clinical content.</p></div><SourceStatus condition={condition} /></aside>;
  const quick = condition.card.quick_view;
  return <article className="condition-preview condition-full">
    <div className="preview-heading"><div><p>Quick view</p><h2>{condition.name}</h2></div><Button variant="outline" size="icon" onClick={toggleSaved} aria-label={saved ? 'Remove saved condition' : 'Save condition'}>{saved ? <BookmarkCheck /> : <Bookmark />}</Button></div>
    <div className="condition-meta">{condition.card.curriculum_tags?.map((tag) => <Badge variant="secondary" key={tag}>{humanise(tag)}</Badge>)}<Badge variant="outline">{humanise(condition.coverage)}</Badge></div>
    <p className="one-liner">{quick?.one_liner}</p>
    <div className="pattern-card"><span>Classic pattern</span><p>{quick?.classic_pattern || 'Not supplied in the source card.'}</p></div>
    <dl className="signal-list">
      <div><dt>Key discriminator</dt><dd>{quick?.key_discriminator || 'Not supplied in the source card.'}</dd></div>
      <div><dt>Essential investigation</dt><dd>{quick?.essential_investigation_pattern || 'Not supplied in the source card.'}</dd></div>
      <div><dt>Management principle</dt><dd>{quick?.management_principle || 'Not supplied in the source card.'}</dd></div>
      <div className="red-flag"><dt>Red flag</dt><dd>{quick?.red_flag || 'Not supplied in the source card.'}</dd></div>
    </dl>
    {condition.encounters.length > 0 && <section className="linked-patients"><p className="subsection-label">Patient anchors</p>{condition.encounters.map((encounter) => <div className="patient-anchor" key={encounter.caseId}><div className="patient-avatar">{encounter.patientName.slice(0, 1)}</div><div><strong>{encounter.patientName}, {encounter.ageYears}</strong><p>{encounter.presentation}</p><span>{humanise(encounter.setting)}</span></div></div>)}</section>}
    <section className="deep-sections"><p className="subsection-label">Full authored card</p>{Object.entries(condition.card.sections ?? {}).map(([key, value], index) => <details key={key} open={index === 0}><summary><span>{String(index + 1).padStart(2, '0')}</span>{sectionLabels[key] ?? humanise(key)}</summary><p>{renderAuthoredValue(value)}</p></details>)}</section>
    <SourceStatus condition={condition} />
  </article>;
}

function SourceStatus({ condition }: { condition: Condition }) {
  return <div className="source-status"><ShieldAlert size={18} /><div><strong>Source status</strong><p>Clinical: {humanise(condition.clinicalReviewStatus)} · Relationships: {humanise(condition.relationshipsReviewStatus)}</p></div></div>;
}

function PresentationsView({ presentations, query, setQuery, selected, setSelected, openCondition }: { presentations: Presentation[]; query: string; setQuery: (value: string) => void; selected: Presentation | undefined; setSelected: (id: string) => void; openCondition: (id: string) => void }) {
  const filtered = presentations.filter((presentation) => !query.trim() || `${presentation.name} ${presentation.aliases.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="control-row"><SearchBox value={query} onChange={setQuery} placeholder="Search presentations" /><div className="metric-strip"><span><strong>{presentations.length}</strong> clusters</span><span><strong>{presentations.filter((item) => item.coverageStatus === 'complete').length}</strong> complete</span></div></div>
    <div className="study-grid presentations-grid">
      <section className="condition-list presentation-list"><div className="section-label"><span>Presentation clusters</span><span>{filtered.length} shown</span></div>{filtered.map((presentation) => <button data-presentation-id={presentation.id} type="button" key={presentation.id} className={presentation.id === selected?.id ? 'presentation-row selected' : 'presentation-row'} onClick={() => setSelected(presentation.id)}><div><strong>{presentation.name}</strong><span>{presentation.coreConditionIds.length} conditions · target {presentation.targetCaseCount ?? '—'} cases</span></div><Badge variant="outline">{presentation.coverageStatus}</Badge><ArrowRight size={18} /></button>)}</section>
      <article className="condition-preview presentation-detail">{selected && <><div className="preview-heading"><div><p>Presentation map</p><h2>{selected.name}</h2></div><Badge>{selected.coverageStatus}</Badge></div><div className="presentation-stats"><div><span>Cases</span><strong>{selected.existingCaseIds.length} / {selected.targetCaseCount ?? selected.existingCaseIds.length}</strong><Progress value={Math.min(100, selected.existingCaseIds.length / (selected.targetCaseCount || 1) * 100)} /></div><div><span>Age group</span><strong>{selected.ageGroups.map(humanise).join(', ') || 'Not specified'}</strong></div></div>
        {selected.mustNotMiss.length > 0 && <section className="must-not-miss"><p className="subsection-label"><ShieldAlert size={15} /> Must not miss</p>{selected.mustNotMiss.map((condition) => <button type="button" key={condition.id} onClick={() => openCondition(condition.id)}><span>{condition.name}</span><ArrowRight size={16} /></button>)}</section>}
        <section className="presentation-conditions"><p className="subsection-label">Core conditions</p>{selected.coreConditions.map((condition, index) => <button type="button" key={condition.id} onClick={() => openCondition(condition.id)}><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><span>{condition.name}</span>{selected.mustNotMissIds.includes(condition.id) && <Badge variant="outline">Must not miss</Badge>}<ArrowRight size={16} /></button>)}</section>
        {selected.contrastSets.map((set) => <section className="contrast-set" key={set.set_id}><p className="subsection-label">Authored contrast set</p>{set.conditions.map((id) => <div key={id}><strong>{selected.coreConditions.find((item) => item.id === id)?.name ?? humanise(id)}</strong><span>{humanise(set.rationales?.[id])}</span></div>)}</section>)}
        <div className="source-status"><ShieldAlert size={18} /><div><strong>Relationship review</strong><p>{humanise(selected.relationshipsReviewStatus)} · {humanise(selected.clinicalReviewStatus)}</p></div></div></>}</article>
    </div>
  </>;
}

function CompareView({ conditions, selectedIds, setSelectedIds, openCondition }: { conditions: Condition[]; selectedIds: string[]; setSelectedIds: (ids: string[]) => void; openCondition: (id: string) => void }) {
  const selected = selectedIds.map((id) => conditions.find((condition) => condition.id === id)).filter(Boolean) as Condition[];
  const addCondition = (id: string) => { if (id && !selectedIds.includes(id) && selectedIds.length < 4) setSelectedIds([...selectedIds, id]); };
  const rows: Array<[string, keyof QuickView]> = [['Classic pattern', 'classic_pattern'], ['Key discriminator', 'key_discriminator'], ['Essential investigation', 'essential_investigation_pattern'], ['Management principle', 'management_principle'], ['Red flag', 'red_flag']];
  return <section className="compare-workspace">
    <div className="compare-toolbar"><div><p className="subsection-label">Compare 2–4 authored cards</p><p>The table shows only fields present in MedVenture condition cards.</p></div><NativeSelect className="compare-select" value="" onChange={(event) => addCondition(event.target.value)} aria-label="Add a condition"><NativeSelectOption value="">Add condition…</NativeSelectOption>{conditions.filter((condition) => !selectedIds.includes(condition.id)).map((condition) => <NativeSelectOption key={condition.id} value={condition.id}>{condition.name}</NativeSelectOption>)}</NativeSelect></div>
    <div className="compare-picks">{selected.map((condition) => <Badge key={condition.id} variant="secondary">{condition.name}<button type="button" aria-label={`Remove ${condition.name}`} onClick={() => setSelectedIds(selectedIds.filter((id) => id !== condition.id))}><X size={13} /></button></Badge>)}</div>
    {selected.length < 2 ? <div className="gap-panel"><GitCompareArrows /><h3>Add at least two conditions</h3><p>Choose conditions with authored cards to compare their patterns and discriminators.</p></div> : <div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>Dimension</th>{selected.map((condition) => <th key={condition.id}><button type="button" onClick={() => openCondition(condition.id)}>{condition.name}<ArrowRight size={15} /></button></th>)}</tr></thead><tbody>{rows.map(([label, key]) => <tr key={key}><th>{label}</th>{selected.map((condition) => <td key={condition.id} className={key === 'red_flag' ? 'red-cell' : ''}>{condition.card?.quick_view?.[key] || <span className="not-supplied">Not supplied</span>}</td>)}</tr>)}</tbody></table></div>}
    <div className="compare-note"><ShieldAlert size={17} /><p>Comparison is a deterministic view of existing condition-card fields. It does not infer clinical differences.</p></div>
  </section>;
}

function ImagesView({ media, query, setQuery, mediaType, setMediaType, openMedia }: { media: MediaItem[]; query: string; setQuery: (value: string) => void; mediaType: string; setMediaType: (value: string) => void; openMedia: (item: MediaItem) => void }) {
  const types = ['all', ...new Set(media.map((item) => item.type))];
  const filtered = media.filter((item) => (mediaType === 'all' || item.type === mediaType) && (!query.trim() || `${item.conditionName} ${item.patientName} ${item.investigationName}`.toLowerCase().includes(query.toLowerCase())));
  return <>
    <div className="control-row"><SearchBox value={query} onChange={setQuery} placeholder="Search by condition, patient or investigation" /><NativeSelect value={mediaType} onChange={(event) => setMediaType(event.target.value)} aria-label="Filter media type">{types.map((type) => <NativeSelectOption key={type} value={type}>{type === 'all' ? 'All media' : humanise(type)}</NativeSelectOption>)}</NativeSelect></div>
    <div className="media-summary"><div><strong>{media.filter((item) => item.asset).length}</strong><span>visual requirements</span></div><div><strong>{new Set(media.filter((item) => item.asset).map((item) => item.asset)).size}</strong><span>unique assets</span></div><div><strong>{media.filter((item) => !item.asset).length}</strong><span>authored text-only</span></div><p><ShieldAlert size={16} /> All media remains clinical review required.</p></div>
    <section className="media-grid" aria-label="Clinical media">{filtered.map((item) => <button type="button" className={item.asset ? 'media-card' : 'media-card text-only'} key={item.id} onClick={() => openMedia(item)}>{item.asset ? <NextImage src={`./${item.asset}`} alt={item.altText} width={768} height={512} unoptimized loading="lazy" /> : <div className="text-fallback"><BookOpenText /><span>Intentionally text-only</span></div>}<div><div className="media-card-meta"><Badge variant="secondary">{humanise(item.type)}</Badge><span>{item.patientName}</span></div><h2>{item.conditionName}</h2><p>{item.investigationName}</p></div></button>)}</section>
  </>;
}

function RecallView({ conditions, condition, setConditionId, promptIndex, setPromptIndex, answerVisible, setAnswerVisible, learner, recordRecall }: { conditions: Condition[]; condition: Condition | undefined; setConditionId: (id: string) => void; promptIndex: number; setPromptIndex: (index: number) => void; answerVisible: boolean; setAnswerVisible: (value: boolean) => void; learner: LearnerState; recordRecall: (id: string, rating: RecallRating) => void }) {
  const recallable = conditions.filter((item) => (item.card?.recall_prompts?.length ?? 0) > 0);
  const current = condition && (condition.card?.recall_prompts?.length ?? 0) > 0 ? condition : recallable[0];
  const prompts = current?.card?.recall_prompts ?? [];
  const prompt = prompts[promptIndex % Math.max(1, prompts.length)];
  const reviewed = Object.keys(learner.recallRatings).length;
  const rate = (rating: RecallRating) => { if (!current) return; recordRecall(current.id, rating); setAnswerVisible(false); const nextIndex = recallable.findIndex((item) => item.id === current.id) + 1; setConditionId(recallable[nextIndex % recallable.length].id); setPromptIndex(0); };
  return <div className="recall-layout">
    <aside className="recall-sidebar"><p className="subsection-label">On this device</p><div className="recall-stat"><strong>{reviewed}</strong><span>conditions reviewed</span></div><Progress value={Math.min(100, reviewed / recallable.length * 100)} /><div className="rating-legend"><span><i className="again" />Again {Object.values(learner.recallRatings).filter((item) => item.rating === 'again').length}</span><span><i className="hard" />Hard {Object.values(learner.recallRatings).filter((item) => item.rating === 'hard').length}</span><span><i className="good" />Good {Object.values(learner.recallRatings).filter((item) => item.rating === 'good').length}</span></div><Button variant="outline" onClick={() => { window.localStorage.removeItem(STORAGE_KEY); window.location.reload(); }}><RotateCcw /> Reset local progress</Button></aside>
    <section className="recall-stage"><div className="recall-top"><NativeSelect value={current?.id ?? ''} onChange={(event) => setConditionId(event.target.value)} aria-label="Recall condition">{recallable.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect><span>{promptIndex + 1} / {prompts.length}</span></div>{prompt ? <div className="recall-card"><div className="recall-card-head"><Badge>Recall</Badge><span>{current?.name}</span></div><p>{prompt.prompt}</p>{answerVisible ? <div className="recall-answer"><span>Authored answer</span><p>{prompt.answer}</p></div> : <Button size="lg" onClick={() => setAnswerVisible(true)}>Reveal answer</Button>}</div> : <div className="gap-panel"><Brain /><h3>No recall prompt supplied</h3></div>}
    {answerVisible && <div className="rating-actions"><p>How did that feel?</p><div><Button variant="outline" onClick={() => rate('again')}>Again</Button><Button variant="outline" onClick={() => rate('hard')}>Hard</Button><Button onClick={() => rate('good')}>Good <Check /></Button></div></div>}
    {prompts.length > 1 && <div className="prompt-dots" aria-label="Prompt selection">{prompts.map((_, index) => <button key={index} type="button" aria-label={`Prompt ${index + 1}`} className={index === promptIndex ? 'active' : ''} onClick={() => { setPromptIndex(index); setAnswerVisible(false); }} />)}</div>}
    </section>
  </div>;
}

function SourceDialog({ open, setOpen, data }: { open: boolean; setOpen: (value: boolean) => void; data: DeckData | null }) {
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="source-dialog"><DialogHeader><DialogTitle>MedVenture source status</DialogTitle><DialogDescription>coreDECK Web is a deterministic study view of the attached repository. Missing clinical content is never filled from general knowledge.</DialogDescription></DialogHeader>{data && <><div className="source-metrics"><div><strong>{data.stats.curriculumConditions}</strong><span>curriculum entries</span></div><div><strong>{data.stats.playableConditions}</strong><span>playable conditions</span></div><div><strong>{data.stats.uncoveredConditions}</strong><span>unmapped gaps</span></div><div><strong>{data.stats.mediaRequirements}</strong><span>media requirements</span></div></div><div className="review-warning"><ShieldAlert /><div><strong>Clinical review required</strong><p>All curriculum relationships and media retain their repository review status. Stylised media is educational artwork, not diagnostic source imaging.</p></div></div><dl className="source-details"><div><dt>Source revision</dt><dd>{data.source.revision?.slice(0, 12) ?? 'Not available'}</dd></div><div><dt>Snapshot fingerprint</dt><dd>{data.source.fingerprintSha256.slice(0, 16)}…</dd></div><div><dt>Source repository</dt><dd><a href={data.source.repository} target="_blank" rel="noreferrer">Open MedVenture</a></dd></div></dl></>}</DialogContent></Dialog>;
}

function MediaDialog({ media, close, openCondition }: { media: MediaItem | null; close: () => void; openCondition: (id: string) => void }) {
  return <Dialog open={Boolean(media)} onOpenChange={(open) => !open && close()}><DialogContent className="media-dialog">{media && <><DialogHeader><div className="media-dialog-kicker"><Badge>{humanise(media.type)}</Badge><span>{media.patientName}</span></div><DialogTitle>{media.conditionName}</DialogTitle><DialogDescription>{media.investigationName}</DialogDescription></DialogHeader>{media.asset ? <NextImage src={`./${media.asset}`} alt={media.altText} width={768} height={512} unoptimized /> : <div className="text-fallback large"><BookOpenText /><span>Repository-authored text-only result</span></div>}<section><span>Authored finding</span><p>{media.result?.finding_text ?? media.altText}</p></section>{media.result?.teaching_point && <section><span>Teaching point</span><p>{media.result.teaching_point}</p></section>}<div className="review-warning compact"><ShieldAlert /><p>{humanise(media.clinicalReviewStatus)} · stylised educational asset</p></div>{media.conditionId && <Button onClick={() => { close(); openCondition(media.conditionId as string); }}>Open condition <ArrowRight /></Button>}</>}</DialogContent></Dialog>;
}
