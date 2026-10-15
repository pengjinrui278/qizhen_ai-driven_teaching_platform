export type ImportedScheduleCourse = {
  id: string;
  source: "zju-undergraduate";
  course_id: string | null;
  course_name: string;
  teacher: string;
  location: string | null;
  day_of_week: number;
  periods: number[];
  first_half: boolean;
  second_half: boolean;
  week_pattern: "all" | "odd" | "even";
  confirmed: boolean;
};

export type ImportedScheduleSnapshot = {
  schema_version: 1;
  source: "zju-file-import";
  academic_year_start: number;
  season: string;
  courses: ImportedScheduleCourse[];
  assignments: unknown[];
  fetched_at?: string;
};

export function parseScheduleCsv(text: string): ImportedScheduleSnapshot;
export function parseScheduleXlsx(rows: unknown[][]): ImportedScheduleSnapshot;
export function parseScheduleIcs(text: string): ImportedScheduleSnapshot;
export function parseScheduleFile(filename: string, text: string): ImportedScheduleSnapshot;
