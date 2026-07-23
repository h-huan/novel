import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS location_knowledge_profiles (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, map_point_id TEXT NOT NULL UNIQUE,
      location_name TEXT DEFAULT '', location_alias TEXT DEFAULT '', location_type TEXT DEFAULT '', parent_location_id TEXT DEFAULT '', hierarchy_path TEXT DEFAULT '',
      basic_description TEXT DEFAULT '', visual_features TEXT DEFAULT '', sound_smell_texture TEXT DEFAULT '', atmosphere TEXT DEFAULT '', symbolic_meaning TEXT DEFAULT '',
      geography_position TEXT DEFAULT '', distance_logic TEXT DEFAULT '', traffic_routes TEXT DEFAULT '', entry_conditions TEXT DEFAULT '', exit_conditions TEXT DEFAULT '', hidden_paths TEXT DEFAULT '',
      owner_force TEXT DEFAULT '', controlling_character TEXT DEFAULT '', public_identity TEXT DEFAULT '', secret_identity TEXT DEFAULT '', security_level TEXT DEFAULT '', surveillance_level TEXT DEFAULT '',
      location_function TEXT DEFAULT '', plot_function TEXT DEFAULT '', conflict_function TEXT DEFAULT '', foreshadowing_function TEXT DEFAULT '', resource_function TEXT DEFAULT '', encounter_function TEXT DEFAULT '',
      current_status TEXT DEFAULT '', status_reason TEXT DEFAULT '', danger_level TEXT DEFAULT '', forbidden_behaviors TEXT DEFAULT '', rules_inside TEXT DEFAULT '', punishment_inside TEXT DEFAULT '',
      available_resources TEXT DEFAULT '', scarce_resources TEXT DEFAULT '', special_items TEXT DEFAULT '', trade_value TEXT DEFAULT '', strategic_value TEXT DEFAULT '',
      historical_events TEXT DEFAULT '', past_disaster TEXT DEFAULT '', war_memory TEXT DEFAULT '', lost_truth TEXT DEFAULT '', secret_buried_here TEXT DEFAULT '',
      connected_characters TEXT DEFAULT '', connected_forces TEXT DEFAULT '', connected_foreshadowing TEXT DEFAULT '', connected_chapters TEXT DEFAULT '', connected_world_rules TEXT DEFAULT '',
      scene_hooks TEXT DEFAULT '', sensory_anchor TEXT DEFAULT '', first_arrival_impression TEXT DEFAULT '', revisit_changes TEXT DEFAULT '', climax_usage TEXT DEFAULT '',
      must_obey_rules TEXT DEFAULT '', can_change_rules TEXT DEFAULT '', forbidden_writing TEXT DEFAULT '', easy_to_break_points TEXT DEFAULT '', current_chapter_usage TEXT DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS location_knowledge_relations (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_location_id TEXT NOT NULL, target_location_id TEXT NOT NULL,
      relation_type TEXT NOT NULL, relation_description TEXT DEFAULT '', distance_cost TEXT DEFAULT '', travel_time TEXT DEFAULT '', travel_method TEXT DEFAULT '', risk_level TEXT DEFAULT '', access_condition TEXT DEFAULT '', is_hidden INTEGER DEFAULT 0, is_one_way INTEGER DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_location_knowledge_profiles_project ON location_knowledge_profiles(project_id);
    CREATE INDEX IF NOT EXISTS idx_location_knowledge_relations_source ON location_knowledge_relations(project_id, source_location_id);
  `);
}

export function down(db: DatabaseSync): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_location_knowledge_relations_source;
    DROP INDEX IF EXISTS idx_location_knowledge_profiles_project;
    DROP TABLE IF EXISTS location_knowledge_relations;
    DROP TABLE IF EXISTS location_knowledge_profiles;
  `);
}

export default { up, down };
