import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_extended_profiles (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_id TEXT NOT NULL UNIQUE,
      appearance_memory_points TEXT DEFAULT '', signature_item TEXT DEFAULT '', action_habits TEXT DEFAULT '', clothing_style TEXT DEFAULT '',
      short_term_goal TEXT DEFAULT '', long_term_goal TEXT DEFAULT '', core_desire TEXT DEFAULT '', core_fear TEXT DEFAULT '', current_problem TEXT DEFAULT '', failure_cost TEXT DEFAULT '',
      key_backstory TEXT DEFAULT '', trauma TEXT DEFAULT '', obsession TEXT DEFAULT '', hidden_identity TEXT DEFAULT '', secret TEXT DEFAULT '', main_truth_relation TEXT DEFAULT '',
      ability_source TEXT DEFAULT '', ability_level TEXT DEFAULT '', special_skills TEXT DEFAULT '', ability_limit TEXT DEFAULT '', ability_cost TEXT DEFAULT '', growth_route TEXT DEFAULT '', cannot_use_reason TEXT DEFAULT '',
      body_weakness TEXT DEFAULT '', personality_weakness TEXT DEFAULT '', emotion_weakness TEXT DEFAULT '', relationship_weakness TEXT DEFAULT '', moral_boundary TEXT DEFAULT '', exploitable_point TEXT DEFAULT '',
      surface_personality TEXT DEFAULT '', deep_personality TEXT DEFAULT '', contradiction_point TEXT DEFAULT '', value_system TEXT DEFAULT '',
      speech_style TEXT DEFAULT '', catchphrase TEXT DEFAULT '', common_words TEXT DEFAULT '', forbidden_words TEXT DEFAULT '', tone_to_different_people TEXT DEFAULT '', emotion_outburst_style TEXT DEFAULT '',
      danger_reaction TEXT DEFAULT '', temptation_reaction TEXT DEFAULT '', betrayal_reaction TEXT DEFAULT '', weak_person_reaction TEXT DEFAULT '', strong_person_reaction TEXT DEFAULT '', principle_break_condition TEXT DEFAULT '',
      plot_function TEXT DEFAULT '', conflict_function TEXT DEFAULT '', reversal_function TEXT DEFAULT '', foreshadowing_function TEXT DEFAULT '', reader_empathy_point TEXT DEFAULT '', reader_expectation TEXT DEFAULT '',
      initial_arc_state TEXT DEFAULT '', current_arc_state TEXT DEFAULT '', volume_arc TEXT DEFAULT '', midpoint_arc TEXT DEFAULT '', ending_arc TEXT DEFAULT '',
      must_obey_rules TEXT DEFAULT '', can_change_rules TEXT DEFAULT '', forbidden_writing TEXT DEFAULT '', easy_to_break_points TEXT DEFAULT '', current_chapter_usage TEXT DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_character_extended_profiles_project ON character_extended_profiles(project_id);
  `);
}
